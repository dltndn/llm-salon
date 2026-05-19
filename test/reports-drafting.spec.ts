import { INestApplication } from '@nestjs/common';
import {
  Participant,
  ParticipantStatus,
  ParticipantType,
  Report,
  ReportStatus,
  Topic,
  TopicMode,
  TopicPhase,
  Turn,
  TurnStatus,
} from '@prisma/client';
import * as request from 'supertest';

import { DOMAIN_EVENT } from '../src/events/domain-events';
import { DomainEventBus } from '../src/events/event-bus';
import { createTestApp } from './test-app';

const projectId = '11111111-1111-4111-8111-bbbbbbbbbbbb';
const topicId = '22222222-2222-4222-8222-bbbbbbbbbbbb';
const appParticipantId = '33333333-3333-4333-8333-bbbbbbbbbbbb';
const reporterProviderId = '44444444-4444-4444-8444-bbbbbbbbbbbb';
const otherProviderId = '55555555-5555-4555-8555-bbbbbbbbbbbb';
const now = new Date('2026-05-19T12:00:00.000Z');

class InMemoryReportsDraftingPrisma {
  readonly participants: Participant[] = [
    this.createParticipant({
      id: appParticipantId,
      displayName: 'Codex / App',
      anonymousName: 'Member A',
      participantType: ParticipantType.app,
      providerName: null,
      clientName: 'Codex',
      joinOrder: 1,
    }),
    this.createParticipant({
      id: reporterProviderId,
      displayName: 'gpt-4o',
      anonymousName: 'Member B',
      participantType: ParticipantType.provider,
      providerName: 'openai',
      clientName: null,
      joinOrder: 2,
    }),
    this.createParticipant({
      id: otherProviderId,
      displayName: 'gpt-4o-mini',
      anonymousName: 'Member C',
      participantType: ParticipantType.provider,
      providerName: 'openai',
      clientName: null,
      joinOrder: 3,
    }),
  ];

  private topicRecord: Topic = {
    id: topicId,
    projectId,
    title: 'Report Drafting Topic',
    description: null,
    mode: TopicMode.consensus,
    phase: TopicPhase.debating,
    maxRounds: null,
    maxTurns: 1,
    currentRound: 0,
    currentTurnIndex: 1,
    version: 0,
    reporterParticipantId: null,
    createdAt: now,
    updatedAt: now,
  };

  private turns: Turn[] = [
    {
      id: '66666666-6666-4666-8666-bbbbbbbbbbbb',
      projectId,
      topicId,
      currentParticipantId: appParticipantId,
      turnIndex: 1,
      roundIndex: 0,
      phase: TopicPhase.debating,
      status: TurnStatus.in_progress,
      createdAt: now,
      updatedAt: now,
    },
  ];

  private reports: Report[] = [];

  readonly document = {
    findMany: jest.fn(() => Promise.resolve([])),
  };

  readonly project = {
    findUnique: jest.fn(({ where }) =>
      Promise.resolve(
        where.slug === 'report-drafting-project'
          ? { id: projectId, slug: 'report-drafting-project' }
          : null,
      ),
    ),
  };

  readonly topic = {
    findFirst: jest.fn(({ where }) =>
      Promise.resolve(
        where.id === topicId && where.projectId === projectId
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

  readonly participant = {
    findMany: jest.fn(() =>
      Promise.resolve(
        this.participants.map((participant) => ({
          id: participant.id,
          joinOrder: participant.joinOrder,
          participantType: participant.participantType,
          status: participant.status,
        })),
      ),
    ),
  };

  readonly turn = {
    findFirst: jest.fn(({ where, orderBy, select }) => {
      const matches = this.turns
        .filter((turn) =>
          Object.entries(where).every(
            ([key, value]) => turn[key as keyof Turn] === value,
          ),
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
          Object.keys(select).map((key) => [key, found[key as keyof Turn]]),
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
  };

  readonly message = {
    create: jest.fn(({ data }) =>
      Promise.resolve({
        id: '77777777-7777-4777-8777-000000000001',
        createdAt: now,
        participant: this.participantFor(data.participantId),
        ...data,
      }),
    ),
    findFirst: jest.fn(() => Promise.resolve(null)),
    findMany: jest.fn(() => Promise.resolve([])),
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

  $transaction = jest.fn((callback) => callback(this));
  $queryRaw = jest.fn(() => Promise.resolve([]));

  getTopicRecord(): Topic {
    return { ...this.topicRecord };
  }

  getReports(): Report[] {
    return [...this.reports];
  }

  seedReport(report: Partial<Report> & Pick<Report, 'status'>): void {
    this.reports.push({
      id: '99999999-9999-4999-8999-000000000001',
      projectId,
      topicId,
      reporterParticipantId: reporterProviderId,
      draftContent: null,
      finalContent: null,
      filePath: null,
      createdAt: now,
      updatedAt: now,
      ...report,
    });
  }

  private createParticipant(input: {
    id: string;
    displayName: string;
    anonymousName: string;
    participantType: ParticipantType;
    providerName: string | null;
    clientName: string | null;
    joinOrder: number;
  }): Participant {
    return {
      ...input,
      projectId,
      modelName: input.displayName,
      status: ParticipantStatus.active,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  private participantFor(id: string | null) {
    if (!id) {
      return null;
    }
    const participant = this.participants.find((item) => item.id === id);

    return {
      anonymousName: participant?.anonymousName ?? 'Unknown member',
      displayName: participant?.displayName ?? 'Unknown member',
    };
  }
}

describe('Report drafting entry', () => {
  let app: INestApplication;
  let prisma: InMemoryReportsDraftingPrisma;
  let events: DomainEventBus;

  beforeEach(async () => {
    prisma = new InMemoryReportsDraftingPrisma();
    app = await createTestApp(prisma);
    events = app.get(DomainEventBus);
    jest.spyOn(events, 'emit');
  });

  afterEach(async () => {
    await app.close();
  });

  it('assigns the lowest-order active provider reporter and queues drafting on maxTurns', async () => {
    const response = await request(app.getHttpServer())
      .post(
        `/api/projects/report-drafting-project/topics/${topicId}/messages`,
      )
      .send({
        participantId: appParticipantId,
        content: 'Final debate turn',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      nextMember: null,
      phaseAfter: TopicPhase.drafting,
    });
    expect(prisma.getTopicRecord()).toMatchObject({
      phase: TopicPhase.drafting,
      reporterParticipantId: reporterProviderId,
    });
    expect(prisma.getReports()).toEqual([
      expect.objectContaining({
        reporterParticipantId: reporterProviderId,
        status: ReportStatus.drafting,
        topicId,
        projectId,
      }),
    ]);
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DOMAIN_EVENT.topicPhaseChanged,
        payload: expect.objectContaining({
          projectSlug: 'report-drafting-project',
          phase: TopicPhase.drafting,
        }),
      }),
    );
  });

  it('reuses an existing queued report row instead of creating a duplicate', async () => {
    prisma.seedReport({ status: ReportStatus.none });

    await request(app.getHttpServer())
      .post(
        `/api/projects/report-drafting-project/topics/${topicId}/messages`,
      )
      .send({
        participantId: appParticipantId,
        content: 'Final debate turn',
      })
      .expect(201);

    expect(prisma.getReports()).toHaveLength(1);
    expect(prisma.getReports()[0]).toMatchObject({
      id: '99999999-9999-4999-8999-000000000001',
      status: ReportStatus.drafting,
      reporterParticipantId: reporterProviderId,
    });
    expect(prisma.report.create).not.toHaveBeenCalled();
    expect(prisma.report.update).toHaveBeenCalled();
  });

  it('returns 409 when a non-resumable report already exists for the topic', async () => {
    prisma.seedReport({
      status: ReportStatus.reviewing,
      draftContent: 'Existing draft',
    });

    const response = await request(app.getHttpServer())
      .post(
        `/api/projects/report-drafting-project/topics/${topicId}/messages`,
      )
      .send({
        participantId: appParticipantId,
        content: 'Final debate turn',
      })
      .expect(409);

    expect(response.body.error).toBe('ReportAlreadyExistsError');
    expect(prisma.getTopicRecord().phase).toBe(TopicPhase.debating);
    expect(prisma.getReports()).toHaveLength(1);
    expect(prisma.report.create).not.toHaveBeenCalled();
    expect(
      (prisma.topic.update as jest.Mock).mock.calls.some(
        ([args]) => args.data?.phase === TopicPhase.drafting,
      ),
    ).toBe(false);
    expect(
      (events.emit as jest.Mock).mock.calls.some(
        ([event]) => event.type === DOMAIN_EVENT.topicPhaseChanged,
      ),
    ).toBe(false);
  });

  it('returns 409 when duplicate report rows already exist for the topic', async () => {
    prisma.seedReport({
      id: '99999999-9999-4999-8999-000000000001',
      status: ReportStatus.none,
    });
    prisma.seedReport({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
      status: ReportStatus.drafting,
    });

    const response = await request(app.getHttpServer())
      .post(
        `/api/projects/report-drafting-project/topics/${topicId}/messages`,
      )
      .send({
        participantId: appParticipantId,
        content: 'Final debate turn',
      })
      .expect(409);

    expect(response.body.error).toBe('ReportAlreadyExistsError');
    expect(prisma.getTopicRecord().phase).toBe(TopicPhase.debating);
    expect(prisma.getReports()).toHaveLength(2);
    expect(
      (prisma.topic.update as jest.Mock).mock.calls.some(
        ([args]) => args.data?.phase === TopicPhase.drafting,
      ),
    ).toBe(false);
    expect(
      (events.emit as jest.Mock).mock.calls.some(
        ([event]) => event.type === DOMAIN_EVENT.topicPhaseChanged,
      ),
    ).toBe(false);
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
