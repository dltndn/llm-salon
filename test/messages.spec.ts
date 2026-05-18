import { INestApplication } from '@nestjs/common';
import {
  ParticipantStatus,
  ParticipantType,
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
  private messages: unknown[] = [];

  setDebatingLimits(limits: { maxTurns?: number; maxRounds?: number }) {
    this.topicRecord.phase = TopicPhase.debating;
    this.topicRecord.maxTurns = limits.maxTurns ?? null;
    this.topicRecord.maxRounds = limits.maxRounds ?? null;
    this.turns[0].phase = TopicPhase.debating;
  }

  clearTurns() {
    this.turns = [];
  }

  readonly project = {
    findUnique: jest.fn(({ where }) =>
      Promise.resolve(
        where.slug === 'message-project' ? { id: projectId } : null,
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
        ...data,
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
    findMany: jest.fn(() =>
      Promise.resolve([
        this.buildParticipant(participantAId, 1, 'Member A'),
        this.buildParticipant(participantBId, 2, 'Member B'),
      ]),
    ),
  };

  readonly message = {
    create: jest.fn(({ data }) => {
      const message = {
        id: `77777777-7777-4777-8777-${String(
          this.messages.length + 1,
        ).padStart(12, '0')}`,
        createdAt: now,
        participant: { displayName: 'Member A' },
        ...data,
      };
      this.messages.push(message);

      return Promise.resolve(message);
    }),
  };

  $transaction = jest.fn((callback) => callback(this));
  $queryRaw = jest.fn(() => Promise.resolve([]));

  private buildParticipant(
    id: string,
    joinOrder: number,
    anonymousName: string,
  ) {
    return {
      id,
      projectId,
      displayName: anonymousName,
      anonymousName,
      participantType: ParticipantType.app,
      providerName: null,
      modelName: 'Model',
      clientName: anonymousName,
      status: ParticipantStatus.active,
      joinOrder,
      joinedAt: now,
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
