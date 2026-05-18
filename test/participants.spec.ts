import { INestApplication } from '@nestjs/common';
import {
  ParticipantStatus,
  ParticipantType,
  Prisma,
  ProjectStatus,
  TopicPhase,
} from '@prisma/client';
import * as request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './test-app';

class InMemoryParticipantsPrisma {
  private participants: Array<{
    id: string;
    projectId: string;
    displayName: string;
    anonymousName: string;
    participantType: ParticipantType;
    providerName: string | null;
    modelName: string;
    clientName: string | null;
    status: ParticipantStatus;
    joinOrder: number;
    joinedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  private nextParticipantId = 1;
  private registrationClosed = false;

  closeRegistration() {
    this.registrationClosed = true;
  }

  seedRemovedParticipant(joinOrder: number) {
    const now = new Date();
    this.participants.push({
      id: `removed-participant-${joinOrder}`,
      projectId: 'project-1',
      displayName: 'Removed / Model',
      anonymousName: `Member Removed ${joinOrder}`,
      participantType: ParticipantType.app,
      providerName: null,
      modelName: 'Model',
      clientName: `Removed ${joinOrder}`,
      status: ParticipantStatus.removed,
      joinOrder,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  readonly project = {
    findUnique: jest.fn(({ where }) => {
      if (where.slug !== 'participant-project') {
        return Promise.resolve(null);
      }

      const now = new Date();
      return Promise.resolve({
        id: 'project-1',
        slug: 'participant-project',
        name: 'Participant Project',
        status: ProjectStatus.created,
        createdAt: now,
        updatedAt: now,
      });
    }),
  };

  readonly participant = {
    aggregate: jest.fn(({ where }) => {
      const projectParticipants = this.participants.filter(
        (participant) => participant.projectId === where.projectId,
      );
      const maxJoinOrder = projectParticipants.reduce<number | null>(
        (max, participant) =>
          max === null || participant.joinOrder > max
            ? participant.joinOrder
            : max,
        null,
      );

      return Promise.resolve({ _max: { joinOrder: maxJoinOrder } });
    }),
    create: jest.fn(({ data }) => {
      const duplicateApp = this.participants.some(
        (participant) =>
          participant.projectId === data.projectId &&
          participant.participantType === ParticipantType.app &&
          participant.status !== ParticipantStatus.removed &&
          participant.clientName === data.clientName &&
          participant.modelName === data.modelName,
      );

      if (duplicateApp) {
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on app participant identity',
          {
            clientVersion: 'test',
            code: 'P2002',
            meta: { target: ['project_id', 'client_name', 'model_name'] },
          },
        );
      }

      const now = new Date();
      const participant = {
        id: `participant-${this.nextParticipantId}`,
        projectId: data.projectId,
        displayName: data.displayName,
        anonymousName: data.anonymousName,
        participantType: data.participantType,
        providerName: data.providerName,
        modelName: data.modelName,
        clientName: data.clientName,
        status: data.status,
        joinOrder: data.joinOrder,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      this.nextParticipantId += 1;
      this.participants.push(participant);

      return Promise.resolve(participant);
    }),
  };

  readonly topic = {
    findFirst: jest.fn(() =>
      Promise.resolve(this.registrationClosed ? { id: 'closed-topic' } : null),
    ),
  };

  $transaction = jest.fn((callback) => callback(this));

  $queryRaw = jest.fn(() => Promise.resolve([]));
}

describe('Participant REST API', () => {
  let app: INestApplication;
  let prisma: InMemoryParticipantsPrisma;

  beforeEach(async () => {
    prisma = new InMemoryParticipantsPrisma();
    app = await createTestApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('registers 30 participants with sequential anonymous names', async () => {
    const responses = [];

    for (let index = 1; index <= 30; index += 1) {
      responses.push(
        await request(app.getHttpServer())
          .post('/api/projects/participant-project/participants')
          .send({
            participantType: 'app',
            clientName: `Codex ${index}`,
            modelName: 'GPT-5',
          })
          .expect(201),
      );
    }

    expect(responses.map((response) => response.body.anonymousName)).toEqual([
      'Member A',
      'Member B',
      'Member C',
      'Member D',
      'Member E',
      'Member F',
      'Member G',
      'Member H',
      'Member I',
      'Member J',
      'Member K',
      'Member L',
      'Member M',
      'Member N',
      'Member O',
      'Member P',
      'Member Q',
      'Member R',
      'Member S',
      'Member T',
      'Member U',
      'Member V',
      'Member W',
      'Member X',
      'Member Y',
      'Member Z',
      'Member AA',
      'Member AB',
      'Member AC',
      'Member AD',
    ]);
  });

  it('registers app and provider participants with human details', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/projects/participant-project/participants')
      .send({
        participantType: 'app',
        clientName: 'Codex',
        modelName: 'GPT-5',
      })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/api/projects/participant-project/participants')
      .send({
        participantType: 'provider',
        providerName: 'OpenAI',
        modelName: 'gpt-5',
      })
      .expect(201);

    expect(first.body).toMatchObject({
      displayName: 'Codex / GPT-5',
      anonymousName: 'Member A',
      participantType: ParticipantType.app,
      status: ParticipantStatus.waiting,
      joinOrder: 1,
    });
    expect(second.body).toMatchObject({
      displayName: 'gpt-5',
      anonymousName: 'Member B',
      participantType: ParticipantType.provider,
      joinOrder: 2,
    });
  });

  it('returns anonymous participant payloads when requested', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/projects/participant-project/participants?audience=anonymous')
      .send({
        participantType: 'app',
        clientName: 'Codex',
        modelName: 'GPT-5',
      })
      .expect(201);

    expect(response.body).toEqual({
      participantId: 'participant-1',
      anonymousName: 'Member A',
      joinOrder: 1,
    });
  });

  it('counts removed participants when assigning anonymous names', async () => {
    prisma.seedRemovedParticipant(1);

    const response = await request(app.getHttpServer())
      .post('/api/projects/participant-project/participants')
      .send({
        participantType: 'app',
        clientName: 'Codex',
        modelName: 'GPT-5',
      })
      .expect(201);

    expect(response.body.anonymousName).toBe('Member B');
  });

  it('rejects registration when any topic is drafting or beyond', async () => {
    prisma.closeRegistration();

    await request(app.getHttpServer())
      .post('/api/projects/participant-project/participants')
      .send({
        participantType: 'app',
        clientName: 'Codex',
        modelName: 'GPT-5',
      })
      .expect(409);
  });

  it('rejects invalid registration payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/projects/participant-project/participants')
      .send({
        participantType: 'app',
        modelName: 'GPT-5',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/projects/participant-project/participants')
      .send({
        participantType: 'provider',
        modelName: 'gpt-5',
      })
      .expect(400);
  });
});

const describeIfDatabase =
  process.env.DATABASE_URL === undefined ||
  process.env.LLM_SALON_RUN_DB_TESTS !== '1'
    ? describe.skip
    : describe;

describeIfDatabase('Participant REST API with Prisma', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const slug = 'participant-db-test';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.project.deleteMany({ where: { slug } });
    await prisma.project.create({
      data: {
        name: 'Participant DB Test',
        slug,
      },
    });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { slug } });
    await app.close();
  });

  it('assigns distinct names under concurrent registrations', async () => {
    const responses = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        request(app.getHttpServer())
          .post(`/api/projects/${slug}/participants`)
          .send({
            participantType: 'app',
            clientName: `Client ${index + 1}`,
            modelName: 'Model',
          }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      201,
      201,
    ]);
    expect(
      responses.map((response) => response.body.anonymousName).sort(),
    ).toEqual(['Member A', 'Member B']);
  });

  it('maps duplicate app registrations to 409', async () => {
    const payload = {
      participantType: 'app',
      clientName: 'Codex',
      modelName: 'GPT-5',
    };

    await request(app.getHttpServer())
      .post(`/api/projects/${slug}/participants`)
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/projects/${slug}/participants`)
      .send(payload)
      .expect(409);
  });

  it('rejects registration after a topic reaches drafting', async () => {
    const project = await prisma.project.findUniqueOrThrow({ where: { slug } });
    await prisma.topic.create({
      data: {
        projectId: project.id,
        title: 'Drafting Topic',
        phase: TopicPhase.drafting,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/projects/${slug}/participants`)
      .send({
        participantType: 'app',
        clientName: 'Codex',
        modelName: 'GPT-5',
      })
      .expect(409);
  });
});
