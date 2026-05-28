import { INestApplication } from '@nestjs/common';
import {
  DebateSignal,
  MessageKind,
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
import { createTestApp } from './test-app';

type ParsedSseEvent = {
  id: string;
  event: string;
  data: unknown;
};

const projectId = '11111111-1111-4111-8111-111111111111';
const topicId = '22222222-2222-4222-8222-222222222222';
const participantAId = '33333333-3333-4333-8333-333333333333';
const participantBId = '44444444-4444-4444-8444-444444444444';
const projectSlug = 'sse-project';
const now = new Date('2026-05-18T00:00:00.000Z');

describe('SSE events', () => {
  let app: INestApplication;
  let events: DomainEventBus;

  beforeEach(async () => {
    app = await createTestApp({});
    events = app.get(DomainEventBus);
  });

  afterEach(async () => {
    await app.close();
  });

  it('streams domain events as SSE events', async () => {
    emitMessageCreated(events, 'First message');

    const [event] = await collectSseEvents(app, 1, '0');

    expect(event).toMatchObject({
      id: '1',
      event: DOMAIN_EVENT.messageCreated,
      data: {
        projectId,
        topicId,
        message: {
          id: 'message-1',
          displayName: 'Display A',
          content: 'First message',
          phase: TopicPhase.debating,
          turnIndex: 1,
        },
      },
    });
  });

  it('masks API key patterns before publishing SSE payloads', async () => {
    emitMessageCreated(events, 'leaked apiKey=secret-value');

    const [event] = await collectSseEvents(app, 1, '0');

    expect(JSON.stringify(event.data)).not.toContain('secret-value');
    expect(event).toMatchObject({
      data: {
        message: {
          content: 'leaked apiKey=[redacted]',
        },
      },
    });
  });

  it('replays only events after Last-Event-ID', async () => {
    emitMessageCreated(events, 'First message');
    emitTurnChanged(events);
    emitPhaseChanged(events);

    const replayed = await collectSseEvents(app, 2, '1');

    expect(replayed.map((event) => event.id)).toEqual(['2', '3']);
    expect(replayed.map((event) => event.event)).toEqual([
      DOMAIN_EVENT.turnChanged,
      DOMAIN_EVENT.topicPhaseChanged,
    ]);
  });

  it('caps the per-project reconnect queue at 100 events', async () => {
    for (let index = 0; index < 101; index += 1) {
      emitPhaseChanged(events);
    }

    const replayed = await collectSseEvents(app, 100, '0');

    expect(replayed).toHaveLength(100);
    expect(replayed[0].id).toBe('2');
    expect(replayed[99].id).toBe('101');
  });

  it('maps every API SSE event type', async () => {
    emitMessageCreated(events, 'First message');
    emitTurnChanged(events);
    emitParticipantJoined(events);
    emitPhaseChanged(events);
    emitReportDraftCreated(events);
    emitReportCreated(events);
    emitProjectClosed(events);

    const replayed = await collectSseEvents(app, 7, '0');

    expect(replayed.map((event) => event.event)).toEqual([
      DOMAIN_EVENT.messageCreated,
      DOMAIN_EVENT.turnChanged,
      DOMAIN_EVENT.participantJoined,
      DOMAIN_EVENT.topicPhaseChanged,
      DOMAIN_EVENT.reportDraftCreated,
      DOMAIN_EVENT.reportCreated,
      DOMAIN_EVENT.projectClosed,
    ]);
    expect(replayed[2].data).toEqual({
      projectId,
      participant: {
        id: 'participant-1',
        displayName: 'Display C',
        status: ParticipantStatus.active,
      },
    });
    expect(replayed[4].data).toEqual({
      projectId,
      topicId,
      reportId: 'report-1',
    });
    expect(replayed[5].data).toEqual({
      projectId,
      topicId,
      report: {
        id: 'report-2',
        filePath: '/tmp/report.md',
      },
    });
    expect(replayed[6].data).toEqual({ projectId });
  });

  it('delivers exactly one message.created SSE event after message submission', async () => {
    await app.close();
    app = await createTestApp(new InMemorySseMessagesPrisma());
    events = app.get(DomainEventBus);

    await request(app.getHttpServer())
      .post(`/api/projects/${projectSlug}/topics/${topicId}/messages`)
      .send({
        participantId: participantAId,
        content: 'Submitted through REST',
      })
      .expect(201);

    const replayed = await collectSseEvents(app, 3, '0');

    expect(replayed.map((event) => event.event)).toEqual([
      DOMAIN_EVENT.messageCreated,
      DOMAIN_EVENT.topicPhaseChanged,
      DOMAIN_EVENT.turnChanged,
    ]);
    expect(
      replayed.filter((event) => event.event === DOMAIN_EVENT.messageCreated),
    ).toHaveLength(1);
    expect(replayed[0].data).toMatchObject({
      projectId,
      topicId,
      message: {
        displayName: 'Display A',
        content: 'Submitted through REST',
      },
    });
  });
});

class InMemorySseMessagesPrisma {
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
  private messageCount = 0;

  readonly project = {
    findUnique: jest.fn(({ where }) =>
      Promise.resolve(
        where.slug === projectSlug ? { id: projectId, slug: projectSlug } : null,
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
          ? { currentParticipant: this.participantFor(turn.currentParticipantId) }
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
    findMany: jest.fn(() =>
      Promise.resolve([
        this.buildParticipant(participantAId, 1, 'Display A', 'Member A'),
        this.buildParticipant(participantBId, 2, 'Display B', 'Member B'),
      ]),
    ),
    updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
  };

  readonly message = {
    create: jest.fn(({ data }) => {
      this.messageCount += 1;
      return Promise.resolve({
        id: `77777777-7777-4777-8777-${String(this.messageCount).padStart(
          12,
          '0',
        )}`,
        createdAt: now,
        participant: { displayName: 'Display A' },
        ...data,
      });
    }),
  };

  $transaction = jest.fn((callback) => callback(this));
  $queryRaw = jest.fn(() => Promise.resolve([]));

  private buildParticipant(
    id: string,
    joinOrder: number,
    displayName: string,
    anonymousName: string,
  ) {
    return {
      id,
      projectId,
      displayName,
      anonymousName,
      participantType: ParticipantType.app,
      providerName: null,
      modelName: 'Model',
      clientName: displayName,
      status: ParticipantStatus.active,
      joinOrder,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  private participantFor(id: string | null) {
    if (id === participantAId) {
      return { anonymousName: 'Member A', displayName: 'Display A' };
    }

    if (id === participantBId) {
      return { anonymousName: 'Member B', displayName: 'Display B' };
    }

    return null;
  }
}

async function collectSseEvents(
  app: INestApplication,
  count: number,
  lastEventId: string,
): Promise<ParsedSseEvent[]> {
  let collected = '';
  let settled = false;

  await new Promise<void>((resolve, reject) => {
    request(app.getHttpServer())
      .get(`/projects/${projectSlug}/events`)
      .set('Accept', 'text/event-stream')
      .set('Last-Event-ID', lastEventId)
      .buffer(true)
      .parse((response, callback) => {
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          collected += chunk;
          if (parseSseEvents(collected).length >= count && !settled) {
            settled = true;
            callback(null, collected);
            (response as unknown as { destroy: () => void }).destroy();
          }
        });
      })
      .end((error) => {
        if (error && !settled) {
          reject(error);
          return;
        }

        resolve();
      });
  });

  return parseSseEvents(collected).slice(0, count);
}

function parseSseEvents(input: string): ParsedSseEvent[] {
  return input
    .split('\n\n')
    .filter((frame) => frame.trim().length > 0)
    .map((frame) => {
      const lines = frame.split('\n');
      const id = readSseLine(lines, 'id');
      const event = readSseLine(lines, 'event');
      const data = readSseLine(lines, 'data');

      return {
        id,
        event,
        data: JSON.parse(data),
      };
    });
}

function readSseLine(lines: string[], field: string): string {
  const prefix = `${field}: `;
  const line = lines.find((item) => item.startsWith(prefix));

  if (!line) {
    throw new Error(`Missing SSE field: ${field}`);
  }

  return line.slice(prefix.length);
}

function emitMessageCreated(events: DomainEventBus, content: string): void {
  events.emit({
    type: DOMAIN_EVENT.messageCreated,
    payload: {
      projectId,
      projectSlug,
      topicId,
      message: {
        id: 'message-1',
        projectId,
        topicId,
        participantId: '33333333-3333-4333-8333-333333333333',
        kind: MessageKind.statement,
        turnIndex: 1,
        roundIndex: 0,
        phase: TopicPhase.debating,
        content,
        debateSignal: DebateSignal.Continue,
        createdAt: new Date('2026-05-18T00:00:00.000Z'),
        participant: { displayName: 'Display A' },
      },
    },
  });
}

function emitTurnChanged(events: DomainEventBus): void {
  events.emit({
    type: DOMAIN_EVENT.turnChanged,
    payload: {
      projectId,
      projectSlug,
      topicId,
      turn: {
        id: 'turn-1',
        projectId,
        topicId,
        currentParticipantId: participantBId,
        turnIndex: 2,
        roundIndex: 0,
        phase: TopicPhase.debating,
        status: TurnStatus.in_progress,
        createdAt: new Date('2026-05-18T00:00:00.000Z'),
        updatedAt: new Date('2026-05-18T00:00:00.000Z'),
        currentParticipant: { displayName: 'Display B' },
      },
    },
  });
}

function emitParticipantJoined(events: DomainEventBus): void {
  events.emit({
    type: DOMAIN_EVENT.participantJoined,
    payload: {
      projectId,
      projectSlug,
      participant: {
        id: 'participant-1',
        displayName: 'Display C',
        status: ParticipantStatus.active,
      },
    },
  });
}

function emitPhaseChanged(events: DomainEventBus): void {
  events.emit({
    type: DOMAIN_EVENT.topicPhaseChanged,
    payload: {
      projectId,
      projectSlug,
      topicId,
      phase: TopicPhase.drafting,
    },
  });
}

function emitReportDraftCreated(events: DomainEventBus): void {
  events.emit({
    type: DOMAIN_EVENT.reportDraftCreated,
    payload: {
      projectId,
      projectSlug,
      topicId,
      reportId: 'report-1',
    },
  });
}

function emitReportCreated(events: DomainEventBus): void {
  events.emit({
    type: DOMAIN_EVENT.reportCreated,
    payload: {
      projectId,
      projectSlug,
      topicId,
      report: {
        id: 'report-2',
        filePath: '/tmp/report.md',
      },
    },
  });
}

function emitProjectClosed(events: DomainEventBus): void {
  events.emit({
    type: DOMAIN_EVENT.projectClosed,
    payload: {
      projectId,
      projectSlug,
    },
  });
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
