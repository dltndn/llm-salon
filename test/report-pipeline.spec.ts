import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import {
  MessageKind,
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

import { DocumentsService } from '../src/documents/documents.service';
import { DOMAIN_EVENT } from '../src/events/domain-events';
import { DomainEventBus } from '../src/events/event-bus';
import { LlmAdapter } from '../src/llm/llm-adapter.interface';
import { LlmProviderRegistry } from '../src/llm/llm-provider.registry';
import { createTestApp } from './test-app';

const projectId = '11111111-1111-4111-8111-cccccccccccc';
const topicId = '22222222-2222-4222-8222-cccccccccccc';
const appParticipantId = '33333333-3333-4333-8333-cccccccccccc';
const reporterProviderId = '44444444-4444-4444-8444-cccccccccccc';
const otherProviderId = '55555555-5555-4555-8555-cccccccccccc';
const now = new Date('2026-05-19T14:00:00.000Z');

class InMemoryReportPipelinePrisma {
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
    title: 'Report Pipeline Topic',
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
      id: '66666666-6666-4666-8666-cccccccccccc',
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
  private documentRecords: Array<{
    id: string;
    projectId: string;
    topicId: string;
    fileName: string;
    filePath: string;
    mimeType: string;
    createdAt: Date;
  }> = [];
  readonly messages: Array<{
    id: string;
    projectId: string;
    topicId: string;
    participantId: string;
    kind: MessageKind;
    turnIndex: number;
    roundIndex: number;
    phase: TopicPhase;
    content: string;
    createdAt: Date;
    participant: { displayName: string; anonymousName: string };
  }> = [];

  readonly document = {
    findMany: jest.fn(() => Promise.resolve([...this.documentRecords])),
  };

  readonly project = {
    findUnique: jest.fn(({ where }) =>
      Promise.resolve(
        where.id === projectId || where.slug === 'report-pipeline-project'
          ? { id: projectId, slug: 'report-pipeline-project' }
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
    update: jest.fn(({ where, data }) => {
      if (where.id !== topicId) {
        return Promise.resolve(null);
      }

      this.topicRecord = {
        ...this.topicRecord,
        ...applyTopicUpdateData(this.topicRecord, data),
        updatedAt: now,
      };

      return Promise.resolve({ ...this.topicRecord });
    }),
  };

  readonly participant = {
    findMany: jest.fn(({ where }) =>
      Promise.resolve(
        this.participants
          .filter((participant) => participant.projectId === where.projectId)
          .map((participant) => ({ ...participant })),
      ),
    ),
    findFirst: jest.fn(({ where }) => {
      const participant = this.participants.find(
        (item) =>
          item.id === where.id &&
          item.projectId === where.projectId &&
          (!where.status || item.status === where.status),
      );

      return Promise.resolve(participant ? { ...participant } : null);
    }),
    updateMany: jest.fn(({ where, data }) => {
      let count = 0;
      this.participants.forEach((participant, index) => {
        if (
          (!where.id || participant.id === where.id) &&
          (!where.status || participant.status === where.status)
        ) {
          count += 1;
          this.participants[index] = { ...participant, ...data, updatedAt: now };
        }
      });

      return Promise.resolve({ count });
    }),
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
      const turn: Turn = {
        id: `turn-${this.turns.length + 1}`,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.turns.push(turn);

      return Promise.resolve({ ...turn });
    }),
  };

  readonly message = {
    create: jest.fn(({ data }) => {
      const participant = this.participants.find(
        (item) => item.id === data.participantId,
      );
      const message = {
        id: `message-${this.messages.length + 1}`,
        createdAt: now,
        participant: {
          displayName: participant?.displayName ?? 'Unknown member',
          anonymousName: participant?.anonymousName ?? 'Unknown member',
        },
        ...data,
      };
      this.messages.push(message);

      return Promise.resolve({ ...message });
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
    findMany: jest.fn(({ where, include }) =>
      Promise.resolve(
        this.messages
          .filter(
            (message) =>
              message.topicId === where.topicId &&
              (!where.kind || message.kind === where.kind),
          )
          .map((message) => ({
            ...message,
            ...(include?.participant
              ? {
                  participant: {
                    anonymousName: message.participant.anonymousName,
                  },
                }
              : {}),
          })),
      ),
    ),
  };

  readonly report = {
    findFirst: jest.fn(({ where }) =>
      Promise.resolve(this.reports.find((report) => matchesReportWhere(report, where)) ?? null),
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
        id: '88888888-8888-4888-8888-cccccccccccc',
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

  getInProgressTurn(): Turn | undefined {
    return this.turns.find((turn) => turn.status === TurnStatus.in_progress);
  }

  seedPreparingForCheckpoint(): void {
    this.topicRecord = {
      ...this.topicRecord,
      phase: TopicPhase.preparing,
      maxTurns: 1,
      reporterParticipantId: null,
    };
    this.turns = [
      {
        ...this.turns[0],
        phase: TopicPhase.preparing,
        status: TurnStatus.in_progress,
        turnIndex: 1,
        currentParticipantId: appParticipantId,
      },
    ];
    this.reports = [];
  }

  seedReviewingState(reportStatus: ReportStatus = ReportStatus.reviewing): void {
    this.topicRecord = {
      ...this.topicRecord,
      phase: TopicPhase.reviewing,
      reporterParticipantId: reporterProviderId,
    };
    this.reports = [
      {
        id: '88888888-8888-4888-8888-cccccccccccc',
        projectId,
        topicId,
        reporterParticipantId: reporterProviderId,
        status: reportStatus,
        draftContent: '# Draft report',
        finalContent: null,
        filePath: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  seedDuplicateReports(): void {
    this.reports.push({
      id: '99999999-9999-4999-8999-cccccccccccc',
      projectId,
      topicId,
      reporterParticipantId: reporterProviderId,
      status: ReportStatus.none,
      draftContent: null,
      finalContent: null,
      filePath: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  seedPendingDocument(): void {
    this.documentRecords = [
      {
        id: 'doc-cccc-cccc-cccc-cccccccccccc',
        projectId,
        topicId,
        fileName: 'notes.txt',
        filePath: 'ignored',
        mimeType: 'text/plain',
        createdAt: now,
      },
    ];
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

describe('Report pipeline e2e', () => {
  let app: INestApplication;
  let prisma: InMemoryReportPipelinePrisma;
  let adapter: jest.Mocked<LlmAdapter>;
  let events: DomainEventBus;
  let tempHome: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'llm-salon-report-pipeline-'));
    process.env.LLM_SALON_HOME = tempHome;
    process.env.OPENAI_API_KEY = 'test-openai-key';
    prisma = new InMemoryReportPipelinePrisma();
    adapter = {
      providerName: 'openai',
      generate: jest.fn(),
    };
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLM_SALON_HOME;
    if (app) {
      await app.close();
    }
    await rm(tempHome, { recursive: true, force: true });
  });

  async function bootApp(
    overrides: Parameters<typeof createTestApp>[1] = [],
  ): Promise<void> {
    app = await createTestApp(prisma, [
      (builder) =>
        builder.overrideProvider(LlmProviderRegistry).useValue({
          get: jest.fn(() => adapter),
          listProviderNames: jest.fn(() => ['openai']),
        }),
      ...overrides,
    ]);
    events = app.get(DomainEventBus);
    jest.spyOn(events, 'emit');
  }

  it('runs preparing through finalized with mock LLM (phase 6 checkpoint)', async () => {
    prisma.seedPreparingForCheckpoint();
    adapter.generate
      .mockResolvedValueOnce({ content: '# Draft report' })
      .mockResolvedValueOnce({ content: 'Revision notes' })
      .mockResolvedValueOnce({ content: '# Final report' });
    await bootApp();

    expect(prisma.getTopicRecord().phase).toBe(TopicPhase.preparing);

    const opening = await request(app.getHttpServer())
      .post(
        `/api/projects/report-pipeline-project/topics/${topicId}/messages`,
      )
      .send({
        participantId: appParticipantId,
        content: 'Opening statement',
      })
      .expect(201);

    expect(opening.body.phaseAfter).toBe(TopicPhase.debating);
    await waitFor(() =>
      expect(prisma.getTopicRecord().phase).toBe(TopicPhase.debating),
    );

    const debateTurn = prisma.getInProgressTurn();
    expect(debateTurn?.currentParticipantId).toBeDefined();

    await request(app.getHttpServer())
      .post(
        `/api/projects/report-pipeline-project/topics/${topicId}/messages`,
      )
      .send({
        participantId: debateTurn!.currentParticipantId!,
        content: 'Debate limit turn',
      })
      .expect(201);

    await waitFor(() =>
      expect(prisma.getTopicRecord().phase).toBe(TopicPhase.reviewing),
    );

    await submitAllFeedback(app);

    await waitFor(() =>
      expect(prisma.getTopicRecord().phase).toBe(TopicPhase.finalized),
    );

    const report = prisma.getReports()[0];
    expect(report).toMatchObject({
      status: ReportStatus.finalized,
      finalContent: '# Final report',
    });
    expect(report.filePath).toMatch(
      new RegExp(
        `^${tempHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/projects/report-pipeline-project/reports/`,
      ),
    );
    await expect(readFile(report.filePath!, 'utf8')).resolves.toBe(
      '# Final report',
    );
    expect(report.filePath).toBeTruthy();
    expect(adapter.generate).toHaveBeenCalledTimes(3);
  });

  it('runs drafting through finalized with mock LLM', async () => {
    adapter.generate
      .mockResolvedValueOnce({ content: '# Draft report' })
      .mockResolvedValueOnce({ content: 'Revision notes' })
      .mockResolvedValueOnce({ content: '# Final report' });
    await bootApp();

    await request(app.getHttpServer())
      .post(
        `/api/projects/report-pipeline-project/topics/${topicId}/messages`,
      )
      .send({
        participantId: appParticipantId,
        content: 'Final debate turn',
      })
      .expect(201);

    await waitFor(() =>
      expect(prisma.getTopicRecord().phase).toBe(TopicPhase.reviewing),
    );
    expect(prisma.getReports()[0]).toMatchObject({
      status: ReportStatus.reviewing,
      draftContent: '# Draft report',
    });
    expect(adapter.generate).toHaveBeenCalledTimes(1);

    for (const participantId of [
      appParticipantId,
      reporterProviderId,
      otherProviderId,
    ]) {
      await request(app.getHttpServer())
        .post(
          `/api/projects/report-pipeline-project/topics/${topicId}/messages`,
        )
        .send({
          participantId,
          content: `Feedback from ${participantId}`,
        })
        .expect(201);
    }

    await waitFor(() =>
      expect(prisma.getTopicRecord().phase).toBe(TopicPhase.finalized),
    );
    const report = prisma.getReports()[0];
    expect(report).toMatchObject({
      status: ReportStatus.finalized,
      finalContent: '# Final report',
    });
    expect(report.filePath).toMatch(
      new RegExp(
        `^${tempHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/projects/report-pipeline-project/reports/`,
      ),
    );
    await expect(readFile(report.filePath!, 'utf8')).resolves.toBe(
      '# Final report',
    );
    expect(adapter.generate).toHaveBeenCalledTimes(3);
    expect(
      (events.emit as jest.Mock).mock.calls.some(
        ([event]) => event.type === DOMAIN_EVENT.reportDraftCreated,
      ),
    ).toBe(true);
    expect(
      (events.emit as jest.Mock).mock.calls.some(
        ([event]) => event.type === DOMAIN_EVENT.reportCreated,
      ),
    ).toBe(true);
  });

  it('keeps drafting when document read fails', async () => {
    prisma.seedPendingDocument();
    await bootApp([
      (builder) =>
        builder.overrideProvider(DocumentsService).useValue({
          readDocumentContent: jest
            .fn()
            .mockRejectedValue(new Error('read failed')),
        }),
    ]);

    await request(app.getHttpServer())
      .post(
        `/api/projects/report-pipeline-project/topics/${topicId}/messages`,
      )
      .send({
        participantId: appParticipantId,
        content: 'Final debate turn',
      })
      .expect(201);

    await waitFor(() =>
      expect(prisma.getTopicRecord().phase).toBe(TopicPhase.drafting),
    );
    await waitFor(() => expect(prisma.getReports()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(prisma.getTopicRecord().phase).toBe(TopicPhase.drafting);
    expect(adapter.generate).not.toHaveBeenCalled();
  });

  it('keeps finalizing when final file write fails', async () => {
    adapter.generate
      .mockResolvedValueOnce({ content: '# Draft report' })
      .mockResolvedValueOnce({ content: 'Revision notes' })
      .mockResolvedValueOnce({ content: '# Final report' });
    jest
      .spyOn(fsPromises, 'writeFile')
      .mockRejectedValueOnce(new Error('disk full'));
    await bootApp();

    await request(app.getHttpServer())
      .post(
        `/api/projects/report-pipeline-project/topics/${topicId}/messages`,
      )
      .send({
        participantId: appParticipantId,
        content: 'Final debate turn',
      })
      .expect(201);

    await waitFor(() =>
      expect(prisma.getTopicRecord().phase).toBe(TopicPhase.reviewing),
    );

    await submitAllFeedback(app);

    await waitFor(() => expect(adapter.generate).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(prisma.getTopicRecord().phase).toBe(TopicPhase.finalizing),
    );
    expect(prisma.getTopicRecord().phase).not.toBe(TopicPhase.finalized);
    expect(prisma.getReports()[0].finalContent).toBeNull();
  });

  it('does not advance to finalizing when duplicate report rows exist', async () => {
    await bootApp();
    prisma.seedReviewingState();
    prisma.seedDuplicateReports();

    await submitAllFeedback(app);

    expect(prisma.getTopicRecord().phase).toBe(TopicPhase.reviewing);
    expect(
      (prisma.report.update as jest.Mock).mock.calls.some(
        ([args]) => args.data?.status === ReportStatus.finalizing,
      ),
    ).toBe(false);
  });

  it('does not advance to finalizing when the report is not reviewing', async () => {
    await bootApp();
    prisma.seedReviewingState(ReportStatus.draft_ready);

    await submitAllFeedback(app);

    expect(prisma.getTopicRecord().phase).toBe(TopicPhase.reviewing);
    expect(
      (prisma.report.update as jest.Mock).mock.calls.some(
        ([args]) => args.data?.status === ReportStatus.finalizing,
      ),
    ).toBe(false);
  });
});

async function submitAllFeedback(app: INestApplication): Promise<void> {
  for (const participantId of [
    appParticipantId,
    reporterProviderId,
    otherProviderId,
  ]) {
    await request(app.getHttpServer())
      .post(`/api/projects/report-pipeline-project/topics/${topicId}/messages`)
      .send({
        participantId,
        content: `Feedback from ${participantId}`,
      })
      .expect(201);
  }
}

function matchesReportWhere(
  report: Report,
  where: {
    id?: string;
    projectId?: string;
    topicId?: string;
    status?: ReportStatus;
    draftContent?: string | null;
  },
): boolean {
  return (
    (where.id === undefined || report.id === where.id) &&
    (where.projectId === undefined || report.projectId === where.projectId) &&
    (where.topicId === undefined || report.topicId === where.topicId) &&
    (where.status === undefined || report.status === where.status) &&
    (where.draftContent === undefined || report.draftContent === where.draftContent)
  );
}

function pickSelected<T extends Record<string, unknown>>(
  value: T,
  select: Record<string, boolean>,
) {
  return Object.fromEntries(
    Object.keys(select)
      .filter((key) => select[key])
      .map((key) => [key, value[key]]),
  );
}

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

async function waitFor(
  assertion: () => void | Promise<void>,
  timeoutMs = 3_000,
): Promise<void> {
  const startedAt = Date.now();

  while (true) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}
