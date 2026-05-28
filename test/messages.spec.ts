import { INestApplication } from '@nestjs/common';
import {
  DebateSignal,
  MessageKind,
  Participant,
  ParticipantStatus,
  ParticipantType,
  Report,
  Topic,
  TopicMode,
  TopicPhase,
  Turn,
  TurnStatus,
} from '@prisma/client';
import * as request from 'supertest';

import { DOMAIN_EVENT } from '../src/events/domain-events';
import { DomainEventBus } from '../src/events/event-bus';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './test-app';

const projectId = '11111111-1111-4111-8111-111111111111';
const topicId = '22222222-2222-4222-8222-222222222222';
const participantAId = '33333333-3333-4333-8333-333333333333';
const participantBId = '44444444-4444-4444-8444-444444444444';
const providerParticipantId = '66666666-6666-4666-8666-666666666666';
const now = new Date('2026-05-18T00:00:00.000Z');

class InMemoryMessagesPrisma {
  private topicRecord: Topic = {
    id: topicId,
    projectId,
    title: 'Topic',
    description: null,
    mode: TopicMode.consensus,
    phase: TopicPhase.preparing,
    maxRounds: null,
    maxTurns: null,
    currentRound: 0,
    currentTurnIndex: 1,
    version: 0,
    reporterParticipantId: null,
    createdAt: now,
    updatedAt: now,
  };
  private turns: Turn[] = [
    {
      id: '55555555-5555-4555-8555-555555555555',
      projectId,
      topicId,
      currentParticipantId: participantAId,
      turnIndex: 1,
      roundIndex: 0,
      phase: TopicPhase.preparing,
      status: TurnStatus.in_progress,
      createdAt: now,
      updatedAt: now,
    },
  ];
  private messages: Array<{
    id: string;
    topicId: string;
    participantId: string;
    kind: MessageKind;
    content: string;
    debateSignal: DebateSignal;
    phase: TopicPhase;
    turnIndex: number;
  }> = [];
  private reports: Report[] = [];
  private participants: Participant[] = [
    this.buildParticipant(participantAId, 1, 'Member A'),
    this.buildParticipant(participantBId, 2, 'Member B'),
    this.buildParticipant(
      providerParticipantId,
      3,
      'Member C',
      ParticipantType.provider,
      new Date('2026-05-19T01:00:00.000Z'),
    ),
  ];

  setDebatingLimits(limits: { maxTurns?: number; maxRounds?: number }) {
    this.topicRecord.phase = TopicPhase.debating;
    this.topicRecord.maxTurns = limits.maxTurns ?? null;
    this.topicRecord.maxRounds = limits.maxRounds ?? null;
    this.turns[0].phase = TopicPhase.debating;
  }

  setTopicMode(mode: TopicMode) {
    this.topicRecord.mode = mode;
  }

  clearTurns() {
    this.turns = [];
  }

  setProviderWaiting() {
    this.participants = this.participants.map((participant) =>
      participant.id === providerParticipantId
        ? { ...participant, status: ParticipantStatus.waiting }
        : participant,
    );
  }

  setParticipantWaiting(participantId: string) {
    this.participants = this.participants.map((participant) =>
      participant.id === participantId
        ? { ...participant, status: ParticipantStatus.waiting }
        : participant,
    );
  }

  getParticipantStatus(participantId: string) {
    return this.participants.find((participant) => participant.id === participantId)
      ?.status;
  }

  addParticipant(participant: Participant) {
    this.participants.push(participant);
  }

  seedTurn(turn: Turn) {
    this.turns.push(turn);
  }

  seedStatement(participantId: string, debateSignal: DebateSignal) {
    this.messages.push({
      id: `seed-${this.messages.length + 1}`,
      topicId,
      participantId,
      kind: MessageKind.statement,
      content: 'Seeded readiness signal',
      debateSignal,
      phase: TopicPhase.debating,
      turnIndex: 0,
    });
  }

  readonly document = {
    findMany: jest.fn(() => Promise.resolve([])),
  };

  readonly project = {
    findUnique: jest.fn(({ where }) =>
      Promise.resolve(
        where.slug === 'message-project'
          ? { id: projectId, slug: 'message-project' }
          : null,
      ),
    ),
  };

  readonly topic = {
    findFirst: jest.fn(({ where }) =>
      Promise.resolve(
        where.id === this.topicRecord.id &&
          where.projectId === this.topicRecord.projectId
          ? { ...this.topicRecord }
          : null,
      ),
    ),
    update: jest.fn(({ data }) => {
      this.topicRecord = {
        ...this.topicRecord,
        ...applyTopicUpdateData(this.topicRecord, data),
        updatedAt: now,
      };

      return Promise.resolve({ ...this.topicRecord });
    }),
  };

  readonly turn = {
    findFirst: jest.fn(({ where, orderBy, select }) => {
      const matches = this.turns
        .filter((turn) =>
          Object.entries(where).every(([key, value]) => {
            const turnKey = key as keyof Turn;
            return turn[turnKey] === value;
          }),
        )
        .sort((left, right) =>
          orderBy?.turnIndex === 'desc'
            ? right.turnIndex - left.turnIndex
            : left.turnIndex - right.turnIndex,
        );
      const found = matches[0] ?? null;

      if (!found || !select) {
        return Promise.resolve(found ? { ...found } : null);
      }

      return Promise.resolve(
        Object.fromEntries(
          Object.keys(select).map((key) => [
            key,
            found[key as keyof Turn],
          ]),
        ),
      );
    }),
    findUnique: jest.fn(({ where, include }) => {
      const turn = this.turns.find((item) => item.id === where.id);

      if (!turn) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        ...turn,
        ...(include?.currentParticipant
          ? {
              currentParticipant: this.participantFor(
                turn.currentParticipantId,
              ),
            }
          : {}),
      });
    }),
    findMany: jest.fn(({ where, select }) => {
      const turns = this.turns.filter(
        (turn) =>
          (!where.topicId || turn.topicId === where.topicId) &&
          (!where.currentParticipantId?.in ||
            where.currentParticipantId.in.includes(
              turn.currentParticipantId,
            )) &&
          (!where.status?.not || turn.status !== where.status.not),
      );

      return Promise.resolve(
        select
          ? turns.map((turn) => pickSelected(turn, select))
          : turns.map((turn) => ({ ...turn })),
      );
    }),
    update: jest.fn(({ where, data }) => {
      const index = this.turns.findIndex((turn) => turn.id === where.id);
      this.turns[index] = { ...this.turns[index], ...data, updatedAt: now };

      return Promise.resolve({ ...this.turns[index] });
    }),
    create: jest.fn(({ data }) => {
      const turn = {
        id: `66666666-6666-4666-8666-${String(this.turns.length + 1).padStart(
          12,
          '0',
        )}`,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.turns.push(turn);

      return Promise.resolve({ ...turn });
    }),
  };

  readonly participant = {
    findMany: jest.fn(({ where, orderBy, select } = {}) => {
      const participants = this.participants
        .filter(
          (participant) =>
            (!where?.projectId || participant.projectId === where.projectId) &&
            (!where?.status ||
              (Array.isArray(where.status.in)
                ? where.status.in.includes(participant.status)
                : participant.status === where.status)),
        )
        .sort((left, right) =>
          orderBy?.joinOrder === 'asc'
            ? left.joinOrder - right.joinOrder
            : left.joinOrder - right.joinOrder,
        );

      return Promise.resolve(
        select
          ? participants.map((participant) => pickSelected(participant, select))
          : participants,
      );
    }),
    updateMany: jest.fn(({ where, data }) => {
      let count = 0;
      this.participants = this.participants.map((participant) => {
        if (
          (!where.id || participant.id === where.id) &&
          (!where.status || participant.status === where.status)
        ) {
          count += 1;
          return { ...participant, ...data, updatedAt: now };
        }

        return participant;
      });

      return Promise.resolve({ count });
    }),
  };

  readonly report = {
    findFirst: jest.fn(({ where }) =>
      Promise.resolve(
        this.reports.find(
          (report) =>
            (where.id === undefined || report.id === where.id) &&
            (where.projectId === undefined ||
              report.projectId === where.projectId) &&
            (where.topicId === undefined || report.topicId === where.topicId) &&
            (where.status === undefined || report.status === where.status) &&
            (where.draftContent === undefined ||
              report.draftContent === where.draftContent),
        ) ?? null,
      ),
    ),
    findMany: jest.fn(({ where, take }) => {
      const matches = this.reports.filter(
        (report) =>
          report.projectId === where.projectId &&
          report.topicId === where.topicId,
      );

      return Promise.resolve(
        typeof take === 'number' ? matches.slice(0, take) : matches,
      );
    }),
    create: jest.fn(({ data }) => {
      const report: Report = {
        id: '88888888-8888-4888-8888-000000000001',
        draftContent: null,
        finalContent: null,
        filePath: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.reports.push(report);

      return Promise.resolve({ ...report });
    }),
    update: jest.fn(({ where, data }) => {
      const index = this.reports.findIndex((report) => report.id === where.id);
      this.reports[index] = {
        ...this.reports[index],
        ...data,
        updatedAt: now,
      };

      return Promise.resolve({ ...this.reports[index] });
    }),
  };

  readonly message = {
    create: jest.fn(({ data }) => {
      const message = {
        id: `77777777-7777-4777-8777-${String(
          this.messages.length + 1,
        ).padStart(12, '0')}`,
        createdAt: now,
        participant: { displayName: 'Member A' },
        debateSignal: data.debateSignal ?? DebateSignal.Continue,
        ...data,
      };
      this.messages.push(message);

      return Promise.resolve(message);
    }),
    findFirst: jest.fn(({ where }) =>
      Promise.resolve(
        this.messages.find(
          (message) =>
            message.topicId === where.topicId &&
            message.participantId === where.participantId &&
            message.kind === where.kind,
        ) ?? null,
      ),
    ),
    findMany: jest.fn(({ where, orderBy, select }) => {
      const messages = this.messages
        .filter(
          (message) =>
            message.topicId === where.topicId &&
            (!where.kind || message.kind === where.kind) &&
            (!where.phase || message.phase === where.phase) &&
            (!where.participantId?.in ||
              where.participantId.in.includes(message.participantId)),
        )
        .sort((left, right) =>
          orderBy?.turnIndex === 'asc'
            ? left.turnIndex - right.turnIndex
            : 0,
        );

      return Promise.resolve(
        select
          ? messages.map((message) => pickSelected(message, select))
          : messages,
      );
    }),
  };

  $transaction = jest.fn((callback) => callback(this));
  $queryRaw = jest.fn(() => Promise.resolve([]));

  private buildParticipant(
    id: string,
    joinOrder: number,
    anonymousName: string,
    participantType: ParticipantType = ParticipantType.app,
    joinedAt: Date = now,
  ) {
    return {
      id,
      projectId,
      displayName: anonymousName,
      anonymousName,
      participantType,
      providerName:
        participantType === ParticipantType.provider ? 'openai' : null,
      modelName: 'Model',
      clientName:
        participantType === ParticipantType.app ? anonymousName : null,
      status: ParticipantStatus.active,
      joinOrder,
      joinedAt,
      createdAt: now,
      updatedAt: now,
    };
  }

  private participantFor(id: string | null) {
    if (id === participantAId) {
      return { anonymousName: 'Member A', displayName: 'Member A' };
    }

    if (id === participantBId) {
      return { anonymousName: 'Member B', displayName: 'Member B' };
    }

    return null;
  }
}

function pickSelected<T extends Record<string, unknown>>(
  value: T,
  select: Record<string, boolean>,
) {
  return Object.fromEntries(
    Object.keys(select).map((key) => [key, value[key]]),
  );
}

describe('Message REST API', () => {
  let app: INestApplication;
  let prisma: InMemoryMessagesPrisma;
  let events: DomainEventBus;

  beforeEach(async () => {
    prisma = new InMemoryMessagesPrisma();
    app = await createTestApp(prisma);
    events = app.get(DomainEventBus);
    jest.spyOn(events, 'emit');
  });

  afterEach(async () => {
    await app.close();
  });

  it('submits a message, starts debating, and advances to the next turn', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantAId,
        content: 'First message',
      })
      .expect(201);

    expect(response.body).toEqual({
      messageId: '77777777-7777-4777-8777-000000000001',
      nextMember: 'Member B',
      phaseAfter: TopicPhase.debating,
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: DOMAIN_EVENT.messageCreated }),
    );
    expect(
      (events.emit as jest.Mock).mock.calls.filter(
        ([event]) => event.type === DOMAIN_EVENT.messageCreated,
      ),
    ).toHaveLength(1);
  });

  it('returns 409 when there is no current turn', async () => {
    prisma.clearTurns();

    await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantAId,
        content: 'No turn',
      })
      .expect(409);
  });

  it('returns 409 when a non-current participant submits', async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantBId,
        content: 'Wrong turn',
      })
      .expect(409);
  });

  it('moves debating topics to drafting when maxTurns is reached', async () => {
    prisma.setDebatingLimits({ maxTurns: 1 });

    const response = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantAId,
        content: 'Last turn',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      nextMember: null,
      phaseAfter: TopicPhase.drafting,
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DOMAIN_EVENT.topicPhaseChanged,
        payload: expect.objectContaining({
          projectSlug: 'message-project',
          phase: TopicPhase.drafting,
        }),
      }),
    );
  });

  it('moves debating topics to drafting after the last speaker in maxRounds', async () => {
    prisma.setDebatingLimits({ maxRounds: 1 });

    const firstResponse = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantAId,
        content: 'Round still has another speaker',
      })
      .expect(201);

    expect(firstResponse.body).toMatchObject({
      nextMember: 'Member B',
      phaseAfter: TopicPhase.debating,
    });

    const secondResponse = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantBId,
        content: 'Last speaker in max round',
      })
      .expect(201);

    expect(secondResponse.body).toMatchObject({
      nextMember: null,
      phaseAfter: TopicPhase.drafting,
    });
  });

  it('moves consensus topics to drafting when all active participants are ready', async () => {
    prisma.setDebatingLimits({});
    prisma.seedStatement(providerParticipantId, DebateSignal.ReadyToFinalize);

    const firstResponse = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantAId,
        content: 'I am ready to finalize.',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    expect(firstResponse.body).toMatchObject({
      nextMember: 'Member B',
      phaseAfter: TopicPhase.debating,
    });

    const secondResponse = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantBId,
        content: 'No unresolved objections remain.',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    expect(secondResponse.body).toMatchObject({
      nextMember: null,
      phaseAfter: TopicPhase.drafting,
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DOMAIN_EVENT.topicPhaseChanged,
        payload: expect.objectContaining({ phase: TopicPhase.drafting }),
      }),
    );
  });

  it('keeps debating until waiting participants in the current round receive their first turn', async () => {
    prisma.setDebatingLimits({});
    prisma.setParticipantWaiting(participantBId);
    prisma.seedStatement(providerParticipantId, DebateSignal.ReadyToFinalize);

    const firstResponse = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantAId,
        content: 'I am ready, but another current-round member has not spoken.',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    expect(firstResponse.body).toMatchObject({
      nextMember: 'Member B',
      phaseAfter: TopicPhase.debating,
    });
    expect(prisma.getParticipantStatus(participantBId)).toBe(
      ParticipantStatus.active,
    );

    const secondResponse = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantBId,
        content: 'I have now had my first turn and am ready.',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    expect(secondResponse.body).toMatchObject({
      nextMember: null,
      phaseAfter: TopicPhase.drafting,
    });
  });

  it('allows consensus early stop when only mid-round arrivals are waiting', async () => {
    prisma.setDebatingLimits({});
    prisma.seedStatement(providerParticipantId, DebateSignal.ReadyToFinalize);
    prisma.addParticipant({
      id: '99999999-9999-4999-8999-999999999999',
      projectId,
      displayName: 'Member D',
      anonymousName: 'Member D',
      participantType: ParticipantType.app,
      providerName: null,
      modelName: 'Model',
      clientName: 'Client D',
      status: ParticipantStatus.waiting,
      joinOrder: 4,
      joinedAt: new Date('2026-05-19T01:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
    });

    await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantAId,
        content: 'I am ready.',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantBId,
        content: 'I am ready too.',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      nextMember: null,
      phaseAfter: TopicPhase.drafting,
    });
  });

  it('allows consensus early stop when a waiting participant already had an assigned turn', async () => {
    prisma.setDebatingLimits({});
    prisma.seedStatement(providerParticipantId, DebateSignal.ReadyToFinalize);
    const legacyParticipantId = '99999999-9999-4999-8999-999999999998';
    prisma.addParticipant({
      id: legacyParticipantId,
      projectId,
      displayName: 'Member D',
      anonymousName: 'Member D',
      participantType: ParticipantType.app,
      providerName: null,
      modelName: 'Model',
      clientName: 'Client D',
      status: ParticipantStatus.waiting,
      joinOrder: 4,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    prisma.seedTurn({
      id: '99999999-9999-4999-8999-999999999997',
      projectId,
      topicId,
      currentParticipantId: legacyParticipantId,
      turnIndex: 0,
      roundIndex: -1,
      phase: TopicPhase.debating,
      status: TurnStatus.completed,
      createdAt: now,
      updatedAt: now,
    });

    await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantAId,
        content: 'I am ready.',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantBId,
        content: 'I am ready too.',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      nextMember: null,
      phaseAfter: TopicPhase.drafting,
    });
  });

  it('keeps consensus topics debating when a latest signal is continue', async () => {
    prisma.setDebatingLimits({});
    prisma.setProviderWaiting();

    await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantAId,
        content: 'I am ready.',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantBId,
        content: 'I still have an objection.',
        debateSignal: 'continue',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      nextMember: 'Member A',
      phaseAfter: TopicPhase.debating,
    });
  });

  it('does not apply readiness early stop to options topics', async () => {
    prisma.setDebatingLimits({});
    prisma.setProviderWaiting();
    prisma.setTopicMode(TopicMode.options);

    await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantAId,
        content: 'Ready with one option.',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/api/projects/message-project/topics/${topicId}/messages`)
      .send({
        participantId: participantBId,
        content: 'Ready with another option.',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      nextMember: 'Member A',
      phaseAfter: TopicPhase.debating,
    });
  });

  it('allows only one of two concurrent submissions for the same turn', async () => {
    const responses = await Promise.all(
      [participantAId, participantAId].map((participantId) =>
        request(app.getHttpServer())
          .post(`/api/projects/message-project/topics/${topicId}/messages`)
          .send({
            participantId,
            content: 'Concurrent message',
          }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      201,
      409,
    ]);
  });
});

function applyTopicUpdateData(
  topic: Topic,
  data: Omit<Partial<Topic>, 'version'> & {
    version?: number | { increment: number };
  },
): Partial<Topic> {
  const { version, ...rest } = data;

  return {
    ...rest,
    ...(typeof version === 'object'
      ? { version: topic.version + version.increment }
      : version !== undefined
        ? { version }
        : {}),
  };
}

const describeIfDatabase =
  process.env.DATABASE_URL === undefined ||
  process.env.LLM_SALON_RUN_DB_TESTS !== '1'
    ? describe.skip
    : describe;

describeIfDatabase('Message REST API with Prisma', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const slug = 'message-db-test';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.project.deleteMany({ where: { slug } });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { slug } });
    await app.close();
  });

  it('allows only one concurrent submitter for a locked turn', async () => {
    const project = await prisma.project.create({
      data: {
        name: 'Message DB Test',
        slug,
      },
    });
    const topic = await prisma.topic.create({
      data: {
        projectId: project.id,
        title: 'Concurrent Topic',
        phase: TopicPhase.preparing,
        currentRound: 0,
        currentTurnIndex: 1,
      },
    });
    const firstParticipant = await prisma.participant.create({
      data: {
        projectId: project.id,
        displayName: 'Member A',
        anonymousName: 'Member A',
        participantType: ParticipantType.app,
        clientName: 'Client A',
        modelName: 'Model',
        status: ParticipantStatus.active,
        joinOrder: 1,
      },
    });
    await prisma.participant.create({
      data: {
        projectId: project.id,
        displayName: 'Member B',
        anonymousName: 'Member B',
        participantType: ParticipantType.app,
        clientName: 'Client B',
        modelName: 'Model',
        status: ParticipantStatus.active,
        joinOrder: 2,
      },
    });
    await prisma.turn.create({
      data: {
        projectId: project.id,
        topicId: topic.id,
        currentParticipantId: firstParticipant.id,
        turnIndex: 1,
        roundIndex: 0,
        phase: TopicPhase.preparing,
        status: TurnStatus.in_progress,
      },
    });

    const responses = await Promise.all(
      ['First concurrent', 'Second concurrent'].map((content) =>
        request(app.getHttpServer())
          .post(`/api/projects/${slug}/topics/${topic.id}/messages`)
          .send({
            participantId: firstParticipant.id,
            content,
          }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      201,
      409,
    ]);
  });
});
