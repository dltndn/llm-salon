import { INestApplication } from '@nestjs/common';
import {
  DebateSignal,
  MessageKind,
  ParticipantStatus,
  ParticipantType,
  TopicPhase,
} from '@prisma/client';
import * as request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './test-app';
import { InMemoryPrisma } from './test-prisma';

describe('Turn wait REST API', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;

  beforeEach(async () => {
    prisma = new InMemoryPrisma();
    app = await createTestApp(prisma as unknown as PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns immediately when the caller already has the turn', async () => {
    const { topicId, participantAId } = await createProjectWithTopic(app);

    const response = await request(app.getHttpServer())
      .get(`/api/projects/wait-project/topics/${topicId}/turn/wait`)
      .query({
        participantId: participantAId,
        audience: 'anonymous',
        timeoutMs: 1000,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      isMyTurn: true,
      currentMember: 'Member A',
      phase: 'preparing',
      currentTurnIndex: 1,
      wakeupReason: 'turn_changed',
    });
    expect(response.body.serverTime).toBeDefined();
    expect(response.body.topicVersion).toBeGreaterThan(0);
  });

  it('wakes when a later turn change makes the caller current', async () => {
    const { topicId, participantAId, participantBId } =
      await createProjectWithTopic(app);

    await submitMessage(app, topicId, participantAId, 'Start debating');
    await submitMessage(app, topicId, participantBId, 'Pass back to A');
    const beforeWait = await request(app.getHttpServer())
      .get(`/api/projects/wait-project/topics/${topicId}/turn`)
      .query({ participantId: participantBId, audience: 'anonymous' })
      .expect(200);
    const waitPromise = request(app.getHttpServer())
      .get(`/api/projects/wait-project/topics/${topicId}/turn/wait`)
      .query({
        participantId: participantBId,
        afterTopicVersion: beforeWait.body.topicVersion,
        audience: 'anonymous',
        timeoutMs: 1000,
      })
      .expect(200)
      .then((response) => response);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await submitMessage(app, topicId, participantAId, 'Advance to B');
    const response = await waitPromise;

    expect(response.body).toMatchObject({
      isMyTurn: true,
      currentMember: 'Member B',
      phase: 'debating',
      wakeupReason: 'turn_changed',
    });
    expect(response.body.topicVersion).toBeGreaterThan(
      beforeWait.body.topicVersion,
    );
  });

  it('times out cleanly when no matching turn change occurs', async () => {
    const { topicId, participantAId, participantBId } =
      await createProjectWithTopic(app);

    await submitMessage(app, topicId, participantAId, 'Start debating');
    await submitMessage(app, topicId, participantBId, 'Pass back to A');
    const beforeWait = await request(app.getHttpServer())
      .get(`/api/projects/wait-project/topics/${topicId}/turn`)
      .query({ participantId: participantBId, audience: 'anonymous' })
      .expect(200);
    const response = await request(app.getHttpServer())
      .get(`/api/projects/wait-project/topics/${topicId}/turn/wait`)
      .query({
        participantId: participantBId,
        afterTopicVersion: beforeWait.body.topicVersion,
        audience: 'anonymous',
        timeoutMs: 5,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      isMyTurn: false,
      currentMember: 'Member A',
      phase: 'debating',
      topicVersion: beforeWait.body.topicVersion,
      wakeupReason: 'timeout',
    });
  });

  it('wakes when consensus readiness advances the topic to drafting', async () => {
    const { topicId, participantAId, participantBId } =
      await createProjectWithTopic(app);
    const providerId = 'provider-ready';

    prisma.seedParticipant('wait-project', {
      id: providerId,
      displayName: 'Provider',
      anonymousName: 'Member C',
      participantType: ParticipantType.provider,
      providerName: 'openai',
      modelName: 'Provider Model',
      clientName: null,
      status: ParticipantStatus.active,
      joinOrder: 3,
      joinedAt: new Date('2026-05-29T00:00:00.000Z'),
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      updatedAt: new Date('2026-05-18T00:00:00.000Z'),
    });
    prisma.seedMessage({
      topicId,
      participantId: providerId,
      kind: MessageKind.statement,
      phase: TopicPhase.debating,
      content: 'Provider is already ready.',
      debateSignal: DebateSignal.ReadyToFinalize,
    });

    await submitMessage(app, topicId, participantAId, 'Ready from A', {
      debateSignal: 'ready_to_finalize',
    });
    await submitMessage(app, topicId, participantBId, 'Ready from B', {
      debateSignal: 'ready_to_finalize',
    });
    const beforeWait = await request(app.getHttpServer())
      .get(`/api/projects/wait-project/topics/${topicId}/turn`)
      .query({ participantId: participantBId, audience: 'anonymous' })
      .expect(200);
    const waitPromise = request(app.getHttpServer())
      .get(`/api/projects/wait-project/topics/${topicId}/turn/wait`)
      .query({
        participantId: participantBId,
        afterTopicVersion: beforeWait.body.topicVersion,
        audience: 'anonymous',
        timeoutMs: 1000,
      })
      .expect(200)
      .then((response) => response);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await submitMessage(app, topicId, participantAId, 'Ready from A again', {
      debateSignal: 'ready_to_finalize',
    });
    const response = await waitPromise;

    expect(response.body).toMatchObject({
      isMyTurn: false,
      phase: 'drafting',
      wakeupReason: 'phase_changed',
    });
    expect(response.body.topicVersion).toBeGreaterThan(
      beforeWait.body.topicVersion,
    );
  });
});

async function createProjectWithTopic(app: INestApplication) {
  await request(app.getHttpServer())
    .post('/api/projects')
    .send({ name: 'Wait Project' })
    .expect(201);
  const participantA = await request(app.getHttpServer())
    .post('/api/projects/wait-project/participants')
    .send({
      participantType: 'app',
      clientName: 'Client A',
      modelName: 'Model',
    })
    .expect(201);
  const participantB = await request(app.getHttpServer())
    .post('/api/projects/wait-project/participants')
    .send({
      participantType: 'app',
      clientName: 'Client B',
      modelName: 'Model',
    })
    .expect(201);
  const topic = await request(app.getHttpServer())
    .post('/api/projects/wait-project/topics')
    .send({ title: 'Wait for turns' })
    .expect(201);

  return {
    topicId: topic.body.id,
    participantAId: participantA.body.id,
    participantBId: participantB.body.id,
  };
}

async function submitMessage(
  app: INestApplication,
  topicId: string,
  participantId: string,
  content: string,
  options: { debateSignal?: string } = {},
) {
  await request(app.getHttpServer())
    .post(`/api/projects/wait-project/topics/${topicId}/messages`)
    .send({ participantId, content, ...options })
    .expect(201);
}
