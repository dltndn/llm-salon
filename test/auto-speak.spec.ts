import { INestApplication } from '@nestjs/common';
import {
  DebateSignal,
  MessageKind,
  Participant,
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
import { LlmAdapter } from '../src/llm/llm-adapter.interface';
import { LlmProviderRegistry } from '../src/llm/llm-provider.registry';
import { ProviderCallFailedError } from '../src/llm/llm.errors';
import { createTestApp } from './test-app';

const projectId = '11111111-1111-4111-8111-aaaaaaaaaaaa';
const topicId = '22222222-2222-4222-8222-aaaaaaaaaaaa';
const appParticipantId = '33333333-3333-4333-8333-aaaaaaaaaaaa';
const providerAId = '44444444-4444-4444-8444-aaaaaaaaaaaa';
const providerBId = '55555555-5555-4555-8555-aaaaaaaaaaaa';
const now = new Date('2026-05-19T00:00:00.000Z');

class InMemoryAutoSpeakPrisma {
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
      id: providerAId,
      displayName: 'gpt-4o',
      anonymousName: 'Member B',
      participantType: ParticipantType.provider,
      providerName: 'openai',
      clientName: null,
      joinOrder: 2,
    }),
    this.createParticipant({
      id: providerBId,
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
    title: 'Auto Speak Topic',
    description: null,
    mode: TopicMode.consensus,
    phase: TopicPhase.debating,
    maxRounds: null,
    maxTurns: 3,
    currentRound: 0,
    currentTurnIndex: 1,
    version: 0,
    reporterParticipantId: null,
    createdAt: now,
    updatedAt: now,
  };

  private turns: Turn[] = [
    {
      id: '66666666-6666-4666-8666-000000000001',
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
    debateSignal: DebateSignal;
    createdAt: Date;
    participant: { anonymousName: string; displayName: string };
  }> = [];
  failProviderMessageCreate = false;

  readonly project = {
    findUnique: jest.fn(({ where }) =>
      Promise.resolve(
        where.slug === 'auto-speak-project' || where.id === projectId
          ? {
              id: projectId,
              slug: 'auto-speak-project',
              name: 'Auto Speak Project',
              status: 'active',
              createdAt: now,
              updatedAt: now,
            }
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
        this.participants.map((participant) => ({ ...participant })),
      ),
    ),
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

  readonly document = {
    findMany: jest.fn(() => Promise.resolve([])),
  };

  readonly message = {
    create: jest.fn(({ data }) => {
      if (
        this.failProviderMessageCreate &&
        data.participantId !== appParticipantId
      ) {
        throw new Error('message insert failed');
      }

      const participant = this.participantFor(data.participantId);
      const message = {
        id: `77777777-7777-4777-8777-${String(
          this.messages.length + 1,
        ).padStart(12, '0')}`,
        createdAt: now,
        kind: MessageKind.statement,
        debateSignal: data.debateSignal ?? DebateSignal.Continue,
        participant,
        ...data,
      };
      this.messages.push(message);

      return Promise.resolve(message);
    }),
    findMany: jest.fn(() =>
      Promise.resolve(
        this.messages.map((message) => ({
          ...message,
          participant: { anonymousName: message.participant.anonymousName },
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
              currentParticipant: this.fullParticipantFor(
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

  $transaction = jest.fn((callback) => callback(this));
  $queryRaw = jest.fn(() => Promise.resolve([]));

  turnByParticipant(participantId: string): Turn | undefined {
    return this.turns.find((turn) => turn.currentParticipantId === participantId);
  }

  turnByIndex(turnIndex: number): Turn | undefined {
    return this.turns.find((turn) => turn.turnIndex === turnIndex);
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

  private fullParticipantFor(id: string | null): Participant | null {
    return this.participants.find((participant) => participant.id === id) ?? null;
  }

  private participantFor(id: string) {
    const participant = this.fullParticipantFor(id);

    return {
      anonymousName: participant?.anonymousName ?? 'Unknown member',
      displayName: participant?.displayName ?? 'Unknown member',
    };
  }
}

describe('Provider auto-speak', () => {
  let app: INestApplication;
  let prisma: InMemoryAutoSpeakPrisma;
  let adapter: jest.Mocked<LlmAdapter>;
  let events: DomainEventBus;

  beforeEach(async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    prisma = new InMemoryAutoSpeakPrisma();
    adapter = {
      providerName: 'openai',
      generate: jest
        .fn()
        .mockResolvedValueOnce({ content: 'Provider B response' })
        .mockResolvedValueOnce({ content: 'Provider C response' }),
    };
    app = await createTestApp(prisma, [
      (builder) =>
        builder.overrideProvider(LlmProviderRegistry).useValue({
          get: jest.fn(() => adapter),
          listProviderNames: jest.fn(() => ['openai']),
        }),
    ]);
    events = app.get(DomainEventBus);
    jest.spyOn(events, 'emit');
  });

  afterEach(async () => {
    delete process.env.OPENAI_API_KEY;
    await app.close();
  });

  it('lets two provider participants speak through the normal message path', async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/auto-speak-project/topics/${topicId}/messages`)
      .send({
        participantId: appParticipantId,
        content: 'Human-started message',
      })
      .expect(201);

    await waitFor(() => expect(adapter.generate).toHaveBeenCalledTimes(2));

    expect(prisma.messages.map((message) => message.participantId)).toEqual([
      appParticipantId,
      providerAId,
      providerBId,
    ]);
    expect(prisma.messages.map((message) => message.content)).toEqual([
      'Human-started message',
      'Provider B response',
      'Provider C response',
    ]);
  });

  it('uses structured provider output to submit debate readiness', async () => {
    adapter.generate.mockReset();
    adapter.generate
      .mockResolvedValueOnce({
        content: [
          'Here is my message:',
          '```json',
          JSON.stringify({
            content: 'Provider B is ready.',
            debateSignal: 'ready_to_finalize',
          }),
          '```',
        ].join('\n'),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          content: 'Provider C is ready.',
          debateSignal: 'ready_to_finalize',
        }),
      });

    await request(app.getHttpServer())
      .post(`/api/projects/auto-speak-project/topics/${topicId}/messages`)
      .send({
        participantId: appParticipantId,
        content: 'Human-started message',
        debateSignal: 'ready_to_finalize',
      })
      .expect(201);

    await waitFor(() => expect(adapter.generate).toHaveBeenCalledTimes(2));

    expect(prisma.messages.map((message) => message.content)).toEqual([
      'Human-started message',
      'Provider B is ready.',
      'Provider C is ready.',
    ]);
    expect(prisma.messages.map((message) => message.debateSignal)).toEqual([
      DebateSignal.ReadyToFinalize,
      DebateSignal.ReadyToFinalize,
      DebateSignal.ReadyToFinalize,
    ]);
  });

  it('skips the provider turn and emits an SSE notice when the call fails', async () => {
    adapter.generate.mockReset();
    adapter.generate.mockRejectedValue(
      new ProviderCallFailedError('openai', 'test failure'),
    );

    await request(app.getHttpServer())
      .post(`/api/projects/auto-speak-project/topics/${topicId}/messages`)
      .send({
        participantId: appParticipantId,
        content: 'Human-started message',
      })
      .expect(201);

    await waitFor(() =>
      expect(
        (events.emit as jest.Mock).mock.calls.some(
          ([event]) =>
            event.type === DOMAIN_EVENT.turnChanged &&
            event.payload.turn.currentParticipantId === providerBId,
        ),
      ).toBe(true),
    );

    expect(prisma.turnByIndex(2)).toMatchObject({
      status: TurnStatus.skipped,
      currentParticipantId: null,
    });
  });

  it('treats empty provider output as a call failure', async () => {
    adapter.generate.mockReset();
    adapter.generate.mockResolvedValue({ content: '   ' });

    await request(app.getHttpServer())
      .post(`/api/projects/auto-speak-project/topics/${topicId}/messages`)
      .send({
        participantId: appParticipantId,
        content: 'Human-started message',
      })
      .expect(201);

    await waitFor(() =>
      expect(prisma.turnByIndex(2)?.status).toBe(TurnStatus.skipped),
    );
    expect(prisma.messages).toHaveLength(1);
  });

  it('does not skip the turn when normal message persistence fails after generation', async () => {
    prisma.failProviderMessageCreate = true;

    await request(app.getHttpServer())
      .post(`/api/projects/auto-speak-project/topics/${topicId}/messages`)
      .send({
        participantId: appParticipantId,
        content: 'Human-started message',
      })
      .expect(201);

    await waitFor(() => expect(adapter.generate).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(prisma.turnByIndex(2)).toMatchObject({
      status: TurnStatus.in_progress,
      currentParticipantId: providerAId,
    });
    expect(prisma.messages).toHaveLength(1);
  });
});

async function waitFor(assertion: () => void): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 1000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
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
