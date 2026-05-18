import { INestApplication } from '@nestjs/common';
import {
  Participant,
  Prisma,
  ProjectStatus,
  TopicMode,
  TopicPhase,
} from '@prisma/client';
import * as request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';
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
  reporterParticipantId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

class InMemoryPrisma {
  private projects: StoredProject[] = [];
  private topics: StoredTopic[] = [];
  private nextProjectId = 1;
  private nextTopicId = 1;

  seedParticipant(
    projectSlug: string,
    participant: Omit<Participant, 'projectId'>,
  ) {
    const project = this.projects.find((item) => item.slug === projectSlug);

    if (!project) {
      throw new Error(`Project not found in test store: ${projectSlug}`);
    }

    this.participants.push({
      ...participant,
      projectId: project.id,
    });
  }

  private participants: Participant[] = [];

  readonly project = {
    create: jest.fn(({ data }) => {
      if (this.projects.some((project) => project.slug === data.slug)) {
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`slug`)',
          {
            clientVersion: 'test',
            code: 'P2002',
            meta: { target: ['slug'] },
          },
        );
      }

      const now = new Date();
      const project: StoredProject = {
        id: `project-${this.nextProjectId}`,
        name: data.name,
        slug: data.slug,
        status: data.status,
        createdAt: now,
        updatedAt: now,
      };

      this.nextProjectId += 1;
      this.projects.push(project);

      return Promise.resolve(project);
    }),
    findMany: jest.fn(() => Promise.resolve([...this.projects].reverse())),
    findUnique: jest.fn(({ where, include, select }) => {
      const project = this.projects.find((item) => item.slug === where.slug);

      if (!project) {
        return Promise.resolve(null);
      }

      if (select?.id) {
        return Promise.resolve({ id: project.id });
      }

      if (include) {
        return Promise.resolve({
          ...project,
          participants: this.participants.filter(
            (participant) => participant.projectId === project.id,
          ),
          topics: this.topics.filter((topic) => topic.projectId === project.id),
        });
      }

      return Promise.resolve(project);
    }),
  };

  readonly topic = {
    create: jest.fn(({ data }) => {
      const now = new Date();
      const topic: StoredTopic = {
        id: `topic-${this.nextTopicId}`,
        projectId: data.projectId,
        title: data.title,
        description: data.description ?? null,
        mode: data.mode,
        phase: data.phase,
        maxRounds: data.maxRounds ?? null,
        maxTurns: data.maxTurns ?? null,
        currentRound: 0,
        currentTurnIndex: 0,
        reporterParticipantId: null,
        createdAt: now,
        updatedAt: now,
      };

      this.nextTopicId += 1;
      this.topics.push(topic);

      return Promise.resolve(topic);
    }),
  };
}

describe('Project and topic REST API', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;

  beforeEach(async () => {
    prisma = new InMemoryPrisma();
    app = await createTestApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates projects with unique slugs and lists them', async () => {
    const firstProject = await request(app.getHttpServer())
      .post('/api/projects')
      .send({ name: 'Research Plan' })
      .expect(201);

    expect(firstProject.body).toMatchObject({
      name: 'Research Plan',
      slug: 'research-plan',
      status: ProjectStatus.created,
    });

    const secondProject = await request(app.getHttpServer())
      .post('/api/projects')
      .send({ name: 'Research Plan' })
      .expect(201);

    expect(secondProject.body.slug).toBe('research-plan-2');

    const projects = await request(app.getHttpServer())
      .get('/api/projects')
      .expect(200);

    expect(projects.body).toHaveLength(2);
    expect(projects.body.map((project: StoredProject) => project.slug)).toEqual([
      'research-plan-2',
      'research-plan',
    ]);
  });

  it('creates a topic with default phase and mode under a project', async () => {
    await request(app.getHttpServer())
      .post('/api/projects')
      .send({ name: 'Debate Space' })
      .expect(201);

    const topic = await request(app.getHttpServer())
      .post('/api/projects/debate-space/topics')
      .send({
        title: 'Choose an approach',
        description: 'Compare implementation paths',
        maxRounds: 2,
      })
      .expect(201);

    expect(topic.body).toMatchObject({
      title: 'Choose an approach',
      description: 'Compare implementation paths',
      mode: TopicMode.consensus,
      phase: TopicPhase.preparing,
      maxRounds: 2,
      maxTurns: null,
    });

    const project = await request(app.getHttpServer())
      .get('/api/projects/debate-space')
      .expect(200);

    expect(project.body.topics).toHaveLength(1);
  });

  it('rejects invalid project and topic payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/projects')
      .send({ name: '' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/projects')
      .send({ name: '   ' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/projects')
      .send({ name: 'Valid Project', unexpected: true })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/projects')
      .send({ name: 'Topic Validation' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/projects/topic-validation/topics')
      .send({ title: '', maxRounds: 0 })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/projects/missing/topics')
      .send({ title: 'Topic' })
      .expect(404);
  });

  it('removes human participant identifiers from anonymous project detail', async () => {
    await request(app.getHttpServer())
      .post('/api/projects')
      .send({ name: 'Audience Project' })
      .expect(201);

    const now = new Date();
    prisma.seedParticipant('audience-project', {
      id: 'participant-1',
      displayName: 'Codex / GPT-5',
      anonymousName: 'Member A',
      participantType: 'app',
      providerName: null,
      modelName: 'GPT-5',
      clientName: 'Codex',
      status: 'waiting',
      joinOrder: 1,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const humanProject = await request(app.getHttpServer())
      .get('/api/projects/audience-project?audience=human')
      .expect(200);
    const anonymousProject = await request(app.getHttpServer())
      .get('/api/projects/audience-project?audience=anonymous')
      .expect(200);

    expect(humanProject.body.participants[0]).toMatchObject({
      displayName: 'Codex / GPT-5',
      modelName: 'GPT-5',
      clientName: 'Codex',
    });
    expect(anonymousProject.body.participants[0]).toMatchObject({
      anonymousName: 'Member A',
    });
    expect(anonymousProject.body.participants[0]).toMatchInlineSnapshot(`
{
  "anonymousName": "Member A",
}
`);
    expect(Object.keys(anonymousProject.body.participants[0])).toEqual([
      'anonymousName',
    ]);
    expect(anonymousProject.body.participants[0]).not.toHaveProperty(
      'displayName',
    );
    expect(anonymousProject.body.participants[0]).not.toHaveProperty(
      'modelName',
    );
    expect(anonymousProject.body.participants[0]).not.toHaveProperty(
      'clientName',
    );
  });
});

const describeIfDatabase =
  process.env.DATABASE_URL === undefined ||
  process.env.LLM_SALON_RUN_DB_TESTS !== '1'
    ? describe.skip
    : describe;

describeIfDatabase('Project and topic REST API with Prisma', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const slugPrefix = 'rest-db-test';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.project.deleteMany({
      where: { slug: { startsWith: slugPrefix } },
    });
    await app.close();
  });

  it('persists project and topic CRUD through Prisma', async () => {
    const project = await request(app.getHttpServer())
      .post('/api/projects')
      .send({ name: 'REST DB Test', slug: slugPrefix })
      .expect(201);

    expect(project.body).toMatchObject({
      slug: slugPrefix,
      status: ProjectStatus.created,
    });

    const topic = await request(app.getHttpServer())
      .post(`/api/projects/${slugPrefix}/topics`)
      .send({ title: 'Persisted Topic' })
      .expect(201);

    expect(topic.body).toMatchObject({
      title: 'Persisted Topic',
      mode: TopicMode.consensus,
      phase: TopicPhase.preparing,
    });

    const savedProject = await prisma.project.findUnique({
      where: { slug: slugPrefix },
      include: { topics: true },
    });

    expect(savedProject?.topics).toHaveLength(1);
  });
});
