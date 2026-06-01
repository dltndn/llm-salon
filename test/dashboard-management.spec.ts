import { INestApplication } from '@nestjs/common';
import {
  Participant,
  ParticipantStatus,
  ParticipantType,
  ProjectStatus,
  Turn,
  TurnStatus,
  TopicMode,
  TopicPhase,
} from '@prisma/client';
import * as request from 'supertest';

import {
  projectMcpPrompt,
  topicMcpPrompt,
  uuidSnippet,
} from '../src/common/mcp-prompt-copy';
import { createTestApp } from './test-app';

type StoredProject = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
};

type StoredTopic = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  mode: TopicMode;
  phase: TopicPhase;
  maxRounds: number | null;
  maxTurns: number | null;
  currentRound: number;
  currentTurnIndex: number;
  version: number;
  reporterParticipantId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

class ManagementInMemoryPrisma {
  private projects: StoredProject[] = [];
  private topics: StoredTopic[] = [];
  private participants: Participant[] = [];
  private turns: Turn[] = [];
  private nextProjectId = 1;
  private nextTopicId = 1;
  private nextTurnId = 1;

  seedProject(project: StoredProject) {
    this.projects.push(project);
  }

  seedTopic(topic: StoredTopic) {
    this.topics.push(topic);
  }

  seedParticipant(participant: Participant) {
    this.participants.push(participant);
  }

  seedTurn(turn: Turn) {
    this.turns.push(turn);
  }

  getTopic(topicId: string) {
    return this.topics.find((topic) => topic.id === topicId);
  }

  getParticipant(participantId: string) {
    return this.participants.find((participant) => participant.id === participantId);
  }

  readonly project = {
    findUnique: jest.fn(({ where, include, select }) => {
      const project = this.projects.find((item) => item.slug === where.slug);

      if (!project) {
        return Promise.resolve(null);
      }

      if (select?.id) {
        return Promise.resolve({ id: project.id });
      }

      if (include) {
        const topicWhere = include.topics?.where;
        const topics = this.topics.filter((topic) => {
          if (topic.projectId !== project.id) {
            return false;
          }

          if (topicWhere?.deletedAt === null && topic.deletedAt !== null) {
            return false;
          }

          return true;
        });

        return Promise.resolve({
          ...project,
          participants: this.participants
            .filter((participant) => participant.projectId === project.id)
            .sort((left, right) => left.joinOrder - right.joinOrder),
          topics: topics.sort(
            (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
          ),
        });
      }

      return Promise.resolve(project);
    }),
  };

  readonly topic = {
    findFirst: jest.fn(({ where }) => {
      const topic = this.topics.find(
        (item) =>
          (!where.id || item.id === where.id) &&
          (!where.projectId || item.projectId === where.projectId),
      );

      return Promise.resolve(topic ?? null);
    }),
    update: jest.fn(({ where, data }) => {
      const index = this.topics.findIndex((topic) => topic.id === where.id);
      this.topics[index] = {
        ...this.topics[index],
        ...data,
        updatedAt: new Date(),
      };

      return Promise.resolve(this.topics[index]);
    }),
  };

  readonly participant = {
    findFirst: jest.fn(({ where }) => {
      const participant = this.participants.find(
        (item) =>
          (!where.id || item.id === where.id) &&
          (!where.projectId || item.projectId === where.projectId),
      );

      return Promise.resolve(participant ?? null);
    }),
    update: jest.fn(({ where, data }) => {
      const index = this.participants.findIndex(
        (participant) => participant.id === where.id,
      );
      this.participants[index] = {
        ...this.participants[index],
        ...data,
        updatedAt: new Date(),
      };

      return Promise.resolve(this.participants[index]);
    }),
  };

  readonly turn = {
    findFirst: jest.fn(({ where, select }) => {
      const turn = this.turns.find(
        (item) =>
          (!where.projectId || item.projectId === where.projectId) &&
          (!where.currentParticipantId ||
            item.currentParticipantId === where.currentParticipantId) &&
          (!where.status || item.status === where.status),
      );

      if (!turn) {
        return Promise.resolve(null);
      }

      return Promise.resolve(
        select
          ? Object.fromEntries(
              Object.keys(select).map((key) => [key, turn[key as keyof Turn]]),
            )
          : turn,
      );
    }),
  };

  readonly message = { findMany: jest.fn(() => Promise.resolve([])) };
  readonly document = { findMany: jest.fn(() => Promise.resolve([])) };
  readonly report = { findFirst: jest.fn(() => Promise.resolve(null)) };

  $transaction = jest.fn((callback) => callback(this));
  $queryRaw = jest.fn(() => Promise.resolve([]));
}

const now = new Date('2026-06-01T00:00:00.000Z');
const projectId = '11111111-1111-4111-8111-111111111111';
const visibleTopicId = '22222222-2222-4222-8222-222222222222';
const hiddenTopicId = '33333333-3333-4333-8333-333333333333';
const participantId = '44444444-4444-4444-8444-444444444444';

function baseTopic(overrides: Partial<StoredTopic>): StoredTopic {
  return {
    id: visibleTopicId,
    projectId,
    title: 'Visible Topic',
    description: null,
    mode: TopicMode.consensus,
    phase: TopicPhase.preparing,
    maxRounds: null,
    maxTurns: null,
    currentRound: 0,
    currentTurnIndex: 0,
    version: 0,
    reporterParticipantId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseParticipant(status: ParticipantStatus): Participant {
  return {
    id: participantId,
    projectId,
    displayName: 'Codex / GPT-5',
    anonymousName: 'Member A',
    participantType: ParticipantType.app,
    providerName: null,
    modelName: 'GPT-5',
    clientName: 'Codex',
    status,
    joinOrder: 1,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

describe('Dashboard management API', () => {
  let app: INestApplication;
  let prisma: ManagementInMemoryPrisma;

  beforeEach(async () => {
    prisma = new ManagementInMemoryPrisma();
    prisma.seedProject({
      id: projectId,
      name: 'Management Project',
      slug: 'management-project',
      status: ProjectStatus.created,
      createdAt: now,
      updatedAt: now,
    });
    app = await createTestApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('excludes hidden topics from default project detail', async () => {
    prisma.seedTopic(baseTopic({ id: visibleTopicId, title: 'Visible' }));
    prisma.seedTopic(
      baseTopic({
        id: hiddenTopicId,
        title: 'Hidden',
        deletedAt: now,
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/api/projects/management-project')
      .expect(200);

    expect(response.body.topics).toHaveLength(1);
    expect(response.body.topics[0].id).toBe(visibleTopicId);
  });

  it('hides a preparing topic and returns deletedAt', async () => {
    prisma.seedTopic(baseTopic({ phase: TopicPhase.preparing }));

    const response = await request(app.getHttpServer())
      .delete(`/api/projects/management-project/topics/${visibleTopicId}`)
      .expect(200);

    expect(response.body.deletedAt).toBeTruthy();
    expect(prisma.getTopic(visibleTopicId)?.deletedAt).toBeTruthy();
  });

  it('rejects hiding a debating topic with 409', async () => {
    prisma.seedTopic(baseTopic({ phase: TopicPhase.debating }));

    await request(app.getHttpServer())
      .delete(`/api/projects/management-project/topics/${visibleTopicId}`)
      .expect(409);

    expect(prisma.getTopic(visibleTopicId)?.deletedAt).toBeNull();
  });

  it.each([
    TopicPhase.finalized,
    TopicPhase.closed,
  ])('hides a %s topic and returns deletedAt', async (phase) => {
    const topicId = `topic-${phase}`;
    prisma.seedTopic(baseTopic({ id: topicId, phase }));

    const response = await request(app.getHttpServer())
      .delete(`/api/projects/management-project/topics/${topicId}`)
      .expect(200);

    expect(response.body.deletedAt).toBeTruthy();
    expect(response.body.phase).toBe(phase);
    expect(prisma.getTopic(topicId)?.deletedAt).toBeTruthy();
  });

  it.each([
    TopicPhase.drafting,
    TopicPhase.reviewing,
    TopicPhase.finalizing,
  ])('rejects hiding a %s topic with 409', async (phase) => {
    const topicId = `topic-${phase}`;
    prisma.seedTopic(baseTopic({ id: topicId, phase }));

    await request(app.getHttpServer())
      .delete(`/api/projects/management-project/topics/${topicId}`)
      .expect(409);

    expect(prisma.getTopic(topicId)?.deletedAt).toBeNull();
  });

  it('returns human participant payload even when audience=anonymous', async () => {
    prisma.seedParticipant(baseParticipant(ParticipantStatus.active));

    const response = await request(app.getHttpServer())
      .delete(
        `/api/projects/management-project/participants/${participantId}?audience=anonymous`,
      )
      .expect(200);

    expect(response.body).toMatchObject({
      id: participantId,
      displayName: 'Codex / GPT-5',
      anonymousName: 'Member A',
      status: ParticipantStatus.removed,
    });
  });

  it('returns human topic payload with deletedAt even when audience=anonymous', async () => {
    prisma.seedTopic(baseTopic({ phase: TopicPhase.preparing }));

    const response = await request(app.getHttpServer())
      .delete(
        `/api/projects/management-project/topics/${visibleTopicId}?audience=anonymous`,
      )
      .expect(200);

    expect(response.body).toMatchObject({
      id: visibleTopicId,
      title: 'Visible Topic',
      phase: TopicPhase.preparing,
    });
    expect(response.body.deletedAt).toBeTruthy();
  });

  it('removes a participant by setting status to removed', async () => {
    prisma.seedParticipant(baseParticipant(ParticipantStatus.active));

    const response = await request(app.getHttpServer())
      .delete(`/api/projects/management-project/participants/${participantId}`)
      .expect(200);

    expect(response.body.status).toBe(ParticipantStatus.removed);
  });

  it('rejects removing the current in-progress turn holder with 409', async () => {
    prisma.seedParticipant(baseParticipant(ParticipantStatus.active));
    prisma.seedTopic(baseTopic({ phase: TopicPhase.debating }));
    prisma.seedTurn({
      id: 'turn-1',
      projectId,
      topicId: visibleTopicId,
      currentParticipantId: participantId,
      turnIndex: 1,
      roundIndex: 0,
      phase: TopicPhase.debating,
      status: TurnStatus.in_progress,
      createdAt: now,
      updatedAt: now,
    });

    await request(app.getHttpServer())
      .delete(`/api/projects/management-project/participants/${participantId}`)
      .expect(409);

    expect(prisma.getParticipant(participantId)?.status).toBe(
      ParticipantStatus.active,
    );
  });
});

describe('Dashboard management prompts', () => {
  it('uses fixed English MCP prompt copy', () => {
    expect(projectMcpPrompt(projectId)).toBe(
      'Join the LLM-Salon project using projectId "11111111-1111-4111-8111-111111111111". If the MCP server is not configured yet, add an MCP server named "llm-salon" using the command `llm-salon mcp`, then call join_project with this projectId.',
    );
    expect(topicMcpPrompt(visibleTopicId)).toBe(
      'Use topicId "22222222-2222-4222-8222-222222222222" for the current LLM-Salon topic. After joining the project, call get_turn and wait_for_turn with this topicId, and submit messages with submit_message when it is your turn.',
    );
    expect(uuidSnippet(projectId)).toBe('1111…1111');
  });
});
