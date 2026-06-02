import { INestApplication } from '@nestjs/common';
import { TopicPhase } from '@prisma/client';
import * as request from 'supertest';

import { LocalStorageService } from '../src/storage/local-storage.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './test-app';
import { InMemoryPrisma } from './test-prisma';

describe('App report production', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createTestApp(new InMemoryPrisma() as unknown as PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('submits draft and final report artifacts for an app reporter', async () => {
    const { topicId, reporterId, reviewerId } = await seedDraftingTopic(app);

    const draftResponse = await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
      .send({
        participantId: reporterId,
        content: '# Draft report\n\nSummary body',
      })
      .expect(201);

    expect(draftResponse.body).toMatchObject({
      phaseAfter: TopicPhase.reviewing,
    });

    await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/messages`)
      .send({
        participantId: reviewerId,
        content: 'Please tighten the summary.',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/messages`)
      .send({
        participantId: reporterId,
        content: 'Will incorporate the feedback.',
      })
      .expect(201);

    const finalResponse = await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/final`)
      .send({
        participantId: reporterId,
        content: '# Final report\n\nFinal body',
      })
      .expect(201);

    expect(finalResponse.body).toMatchObject({
      phaseAfter: TopicPhase.finalized,
      filePath: expect.stringContaining(topicId),
    });
  });

  it('enters drafting with app reporter after consensus without providers', async () => {
    const { topicId, participantAId, participantBId } =
      await createConsensusTopic(app);

    await submitMessage(app, topicId, participantAId, 'Ready from A', {
      debateSignal: 'ready_to_finalize',
    });
    await submitMessage(app, topicId, participantBId, 'Ready from B', {
      debateSignal: 'ready_to_finalize',
    });
    await submitMessage(app, topicId, participantAId, 'Ready from A again', {
      debateSignal: 'ready_to_finalize',
    });

    const waitResponse = await request(app.getHttpServer())
      .get(`/api/projects/app-report/topics/${topicId}/action/wait`)
      .query({
        participantId: participantAId,
        audience: 'anonymous',
        timeoutMs: 0,
      })
      .expect(200);

    expect(waitResponse.body).toMatchObject({
      isActionable: true,
      action: 'submit_report_draft',
      assignedMember: 'Member A',
      phase: TopicPhase.drafting,
    });

    const projectStatus = await request(app.getHttpServer())
      .get('/api/projects/app-report?audience=anonymous')
      .expect(200);

    expect(projectStatus.body.topics[0]).toMatchObject({
      phase: TopicPhase.drafting,
      reporterMember: 'Member A',
    });
  });

  it('rejects draft and final submissions from non-reporters', async () => {
    const { topicId, reporterId, reviewerId } = await seedDraftingTopic(app);

    const draftResponse = await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
      .send({
        participantId: reviewerId,
        content: 'Not allowed',
      })
      .expect(409);

    expect(draftResponse.body).toMatchObject({
      error: 'WrongTurnError',
      currentMember: 'Member B',
    });

    await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
      .send({
        participantId: reporterId,
        content: '# Draft report\n\nSummary body',
      })
      .expect(201);

    await completeReviewing(app, topicId, reporterId, reviewerId);

    const finalResponse = await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/final`)
      .send({
        participantId: reviewerId,
        content: 'Not allowed final',
      })
      .expect(409);

    expect(finalResponse.body).toMatchObject({
      error: 'WrongTurnError',
      currentMember: 'Member B',
    });
  });

  it('rejects draft and final submissions in wrong phases', async () => {
    const { topicId, reporterId, reviewerId } = await seedDraftingTopic(app);

    await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
      .send({
        participantId: reporterId,
        content: '# Draft report\n\nSummary body',
      })
      .expect(201);

    const draftAgain = await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
      .send({
        participantId: reporterId,
        content: 'Duplicate draft',
      })
      .expect(409);

    expect(draftAgain.body.error).toBe('PhaseTransitionError');

    const finalDuringReview = await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/final`)
      .send({
        participantId: reporterId,
        content: 'Too early',
      })
      .expect(409);

    expect(finalDuringReview.body.error).toBe('PhaseTransitionError');
    void reviewerId;
  });

  it('returns task-specific context for actionable callers and rejects others', async () => {
    const { topicId, reporterId, reviewerId } = await seedDraftingTopic(app);

    const draftContext = await request(app.getHttpServer())
      .get(`/api/projects/app-report/topics/${topicId}/context`)
      .query({ participantId: reporterId, audience: 'anonymous' })
      .expect(200);

    expect(draftContext.body.systemPrompt).toContain('assigned reporter');
    expect(
      draftContext.body.contextMessages.some((message: { content: string }) =>
        message.content.includes('[report task]'),
      ),
    ).toBe(true);

    const blockedContext = await request(app.getHttpServer())
      .get(`/api/projects/app-report/topics/${topicId}/context`)
      .query({ participantId: reviewerId, audience: 'anonymous' })
      .expect(400);

    expect(blockedContext.body.message).toContain('No actionable task');
  });

  it('keeps retryable final content when report file write fails', async () => {
    const prisma = new InMemoryPrisma();
    const storage = {
      writeReportMarkdown: jest
        .fn()
        .mockRejectedValueOnce(new Error('disk unavailable'))
        .mockResolvedValueOnce('/tmp/app-report/final.md'),
      deleteReportFile: jest.fn().mockResolvedValue(undefined),
    };

    const failingApp = await createTestApp(prisma as unknown as PrismaService, [
      (builder) =>
        builder.overrideProvider(LocalStorageService).useValue(storage),
    ]);

    try {
      const { topicId, reporterId, reviewerId } =
        await seedDraftingTopic(failingApp);

      await request(failingApp.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
        .send({
          participantId: reporterId,
          content: '# Draft report\n\nSummary body',
        })
        .expect(201);

      await completeReviewing(failingApp, topicId, reporterId, reviewerId);

      await request(failingApp.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/final`)
        .send({
          participantId: reporterId,
          content: '# Final report\n\nFinal body',
        })
        .expect(500);

      const reportStatus = await request(failingApp.getHttpServer())
        .get(`/api/projects/app-report/topics/${topicId}/report`)
        .expect(200);

      expect(reportStatus.body).toMatchObject({
        finalAvailable: true,
        status: 'finalizing',
      });

      const retryResponse = await request(failingApp.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/final`)
        .send({
          participantId: reporterId,
          content: '# Final report\n\nFinal body',
        })
        .expect(201);

      expect(retryResponse.body.phaseAfter).toBe(TopicPhase.finalized);
      expect(storage.writeReportMarkdown).toHaveBeenCalledTimes(2);
      expect(storage.deleteReportFile).not.toHaveBeenCalled();
    } finally {
      await failingApp.close();
    }
  });

  it('resumes final submission after an interrupted claim', async () => {
    const prisma = new InMemoryPrisma();
    const appWithPrisma = await createTestApp(prisma as unknown as PrismaService);
    const { topicId, reporterId, reviewerId } =
      await seedDraftingTopic(appWithPrisma);

    await request(appWithPrisma.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
      .send({
        participantId: reporterId,
        content: '# Draft report\n\nSummary body',
      })
      .expect(201);

    await completeReviewing(appWithPrisma, topicId, reporterId, reviewerId);

    await prisma.report.updateMany({
      where: { topicId },
      data: { finalContent: '# Final report\n\nFinal body' },
    });

    const finalResponse = await request(appWithPrisma.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/final`)
      .send({
        participantId: reporterId,
        content: '# Final report\n\nFinal body',
      })
      .expect(201);

    expect(finalResponse.body.phaseAfter).toBe(TopicPhase.finalized);
    await appWithPrisma.close();
  });

  it('resumes pending final with server canonical content when retry body differs', async () => {
    const prisma = new InMemoryPrisma();
    const storage = {
      writeReportMarkdown: jest.fn().mockResolvedValue('/tmp/app-report/final.md'),
      deleteReportFile: jest.fn().mockResolvedValue(undefined),
    };
    const appWithPrisma = await createTestApp(prisma as unknown as PrismaService, [
      (builder) =>
        builder.overrideProvider(LocalStorageService).useValue(storage),
    ]);

    try {
      const { topicId, reporterId, reviewerId } =
        await seedDraftingTopic(appWithPrisma);
      const canonicalBody = '# Final report\n\nCanonical server body';

      await request(appWithPrisma.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
        .send({
          participantId: reporterId,
          content: '# Draft report\n\nSummary body',
        })
        .expect(201);

      await completeReviewing(appWithPrisma, topicId, reporterId, reviewerId);

      await prisma.report.updateMany({
        where: { topicId },
        data: { finalContent: canonicalBody },
      });

      const finalResponse = await request(appWithPrisma.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/final`)
        .send({
          participantId: reporterId,
          content: '# Regenerated final\n\nDifferent client body',
        })
        .expect(201);

      expect(finalResponse.body.phaseAfter).toBe(TopicPhase.finalized);
      expect(storage.writeReportMarkdown).toHaveBeenCalledWith(
        'app-report',
        topicId,
        canonicalBody,
      );
    } finally {
      await appWithPrisma.close();
    }
  });

  it('exposes pending final content in anonymous report status', async () => {
    const prisma = new InMemoryPrisma();
    const appWithPrisma = await createTestApp(prisma as unknown as PrismaService);
    const pendingBody = '# Final report\n\nPending canonical body';

    try {
      const { topicId, reporterId, reviewerId } =
        await seedDraftingTopic(appWithPrisma);

      await request(appWithPrisma.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
        .send({
          participantId: reporterId,
          content: '# Draft report\n\nSummary body',
        })
        .expect(201);

      await completeReviewing(appWithPrisma, topicId, reporterId, reviewerId);

      await prisma.report.updateMany({
        where: { topicId },
        data: { finalContent: pendingBody },
      });

      const reportStatus = await request(appWithPrisma.getHttpServer())
        .get(`/api/projects/app-report/topics/${topicId}/report`)
        .query({ audience: 'anonymous' })
        .expect(200);

      expect(reportStatus.body).toMatchObject({
        finalAvailable: true,
        status: 'finalizing',
        finalContent: pendingBody,
      });
    } finally {
      await appWithPrisma.close();
    }
  });

  it('uses stored canonical content when updateMany claim races', async () => {
    const storage = {
      writeReportMarkdown: jest.fn().mockResolvedValue('/tmp/app-report/final.md'),
      deleteReportFile: jest.fn().mockResolvedValue(undefined),
    };
    const racingApp = await createTestApp(new InMemoryPrisma() as unknown as PrismaService, [
      (builder) =>
        builder.overrideProvider(LocalStorageService).useValue(storage),
    ]);

    try {
      const { topicId, reporterId, reviewerId } =
        await seedDraftingTopic(racingApp);

      await request(racingApp.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
        .send({
          participantId: reporterId,
          content: '# Draft report\n\nSummary body',
        })
        .expect(201);

      await completeReviewing(racingApp, topicId, reporterId, reviewerId);

      const bodyA = '# Final report\n\nClaim body A';
      const bodyB = '# Final report\n\nClaim body B';

      const [first, second] = await Promise.all([
        request(racingApp.getHttpServer())
          .post(`/api/projects/app-report/topics/${topicId}/report/final`)
          .send({ participantId: reporterId, content: bodyA }),
        request(racingApp.getHttpServer())
          .post(`/api/projects/app-report/topics/${topicId}/report/final`)
          .send({ participantId: reporterId, content: bodyB }),
      ]);

      const statuses = [first.status, second.status].sort(
        (left, right) => left - right,
      );
      expect(statuses).toEqual([201, 409]);

      const writtenContent = storage.writeReportMarkdown.mock.calls[0]?.[2];
      expect([bodyA, bodyB]).toContain(writtenContent);
      expect(
        storage.writeReportMarkdown.mock.calls.every(
          (call) => call[2] === writtenContent,
        ),
      ).toBe(true);
    } finally {
      await racingApp.close();
    }
  });

  it('rejects concurrent duplicate final submissions', async () => {
    const { topicId, reporterId, reviewerId } = await seedDraftingTopic(app);

    await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
      .send({
        participantId: reporterId,
        content: '# Draft report\n\nSummary body',
      })
      .expect(201);

    await completeReviewing(app, topicId, reporterId, reviewerId);

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/final`)
        .send({
          participantId: reporterId,
          content: '# Final report\n\nFinal body',
        }),
      request(app.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/final`)
        .send({
          participantId: reporterId,
          content: '# Final report\n\nFinal body',
        }),
    ]);

    const statuses = [first.status, second.status].sort((left, right) => left - right);
    expect(statuses).toEqual([201, 409]);

    const project = await request(app.getHttpServer())
      .get('/api/projects/app-report?audience=anonymous')
      .expect(200);

    expect(project.body.topics[0].phase).toBe(TopicPhase.finalized);
  });

  it('rejects duplicate final submission after finalize', async () => {
    const { topicId, reporterId, reviewerId } = await seedDraftingTopic(app);

    await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
      .send({
        participantId: reporterId,
        content: '# Draft report\n\nSummary body',
      })
      .expect(201);

    await completeReviewing(app, topicId, reporterId, reviewerId);

    await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/final`)
      .send({
        participantId: reporterId,
        content: '# Final report\n\nFinal body',
      })
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/final`)
      .send({
        participantId: reporterId,
        content: '# Final report\n\nFinal body',
      })
      .expect(409);

    expect(duplicate.body.error).toBe('ParticipantConflictError');
  });

  it('keeps retryable final content when finalize transaction fails', async () => {
    const prisma = new InMemoryPrisma();
    const storage = {
      writeReportMarkdown: jest
        .fn()
        .mockResolvedValueOnce('/tmp/app-report/final.md')
        .mockResolvedValueOnce('/tmp/app-report/final-retry.md'),
      deleteReportFile: jest.fn().mockResolvedValue(undefined),
    };

    const failingApp = await createTestApp(prisma as unknown as PrismaService, [
      (builder) =>
        builder.overrideProvider(LocalStorageService).useValue(storage),
    ]);

    try {
      const { topicId, reporterId, reviewerId } =
        await seedDraftingTopic(failingApp);

      await request(failingApp.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
        .send({
          participantId: reporterId,
          content: '# Draft report\n\nSummary body',
        })
        .expect(201);

      await completeReviewing(failingApp, topicId, reporterId, reviewerId);

      let finalSubmitTxCount = 0;
      let failCompleteOnce = true;
      const originalTransaction = prisma.$transaction.bind(prisma);
      prisma.$transaction = jest.fn((callback: unknown) => {
        finalSubmitTxCount += 1;
        if (failCompleteOnce && finalSubmitTxCount === 2) {
          failCompleteOnce = false;
          return Promise.reject(new Error('finalize transaction failed'));
        }

        return originalTransaction(
          callback as Parameters<InMemoryPrisma['$transaction']>[0],
        );
      });

      await request(failingApp.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/final`)
        .send({
          participantId: reporterId,
          content: '# Final report\n\nFinal body',
        })
        .expect(500);

      expect(storage.deleteReportFile).toHaveBeenCalledWith(
        '/tmp/app-report/final.md',
      );

      const reportStatus = await request(failingApp.getHttpServer())
        .get(`/api/projects/app-report/topics/${topicId}/report`)
        .expect(200);

      expect(reportStatus.body).toMatchObject({
        finalAvailable: true,
        status: 'finalizing',
      });

      finalSubmitTxCount = 0;
      const retryResponse = await request(failingApp.getHttpServer())
        .post(`/api/projects/app-report/topics/${topicId}/report/final`)
        .send({
          participantId: reporterId,
          content: '# Final report\n\nFinal body',
        })
        .expect(201);

      expect(retryResponse.body.phaseAfter).toBe(TopicPhase.finalized);
    } finally {
      await failingApp.close();
    }
  });

  it('does not store final report body as a debate message', async () => {
    const prisma = new InMemoryPrisma();
    const appWithPrisma = await createTestApp(prisma as unknown as PrismaService);
    const { topicId, reporterId, reviewerId } =
      await seedDraftingTopic(appWithPrisma);
    const finalBody = '# Final report\n\nFinal body not in messages';

    await request(appWithPrisma.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
      .send({
        participantId: reporterId,
        content: '# Draft report\n\nSummary body',
      })
      .expect(201);

    await completeReviewing(appWithPrisma, topicId, reporterId, reviewerId);

    const messagesBefore = await prisma.message.findMany({
      where: { topicId },
    });

    await request(appWithPrisma.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/final`)
      .send({
        participantId: reporterId,
        content: finalBody,
      })
      .expect(201);

    const messagesAfter = await prisma.message.findMany({
      where: { topicId },
    });

    expect(messagesAfter).toHaveLength(messagesBefore.length);
    expect(
      messagesAfter.some(
        (message) =>
          String((message as { content: string }).content).includes(finalBody),
      ),
    ).toBe(false);

    await appWithPrisma.close();
  });

  it('includes draft and feedback in finalizing context', async () => {
    const { topicId, reporterId, reviewerId } = await seedDraftingTopic(app);

    await request(app.getHttpServer())
      .post(`/api/projects/app-report/topics/${topicId}/report/draft`)
      .send({
        participantId: reporterId,
        content: '# Draft report\n\nSummary body',
      })
      .expect(201);

    await completeReviewing(app, topicId, reporterId, reviewerId);

    const finalContext = await request(app.getHttpServer())
      .get(`/api/projects/app-report/topics/${topicId}/context`)
      .query({ participantId: reporterId, audience: 'anonymous' })
      .expect(200);

    const contextText = finalContext.body.contextMessages
      .map((message: { content: string }) => message.content)
      .join('\n');

    expect(contextText).toContain('[draft report]');
    expect(contextText).toContain('# Draft report');
    expect(contextText).toContain('[member feedback]');
    expect(contextText).toContain('Review feedback');
    expect(finalContext.body.systemPrompt).toContain('final Markdown report');
  });
});

async function createConsensusTopic(app: INestApplication) {
  await request(app.getHttpServer())
    .post('/api/projects')
    .send({ name: 'App Report' })
    .expect(201);

  const participantA = await request(app.getHttpServer())
    .post('/api/projects/app-report/participants')
    .send({
      participantType: 'app',
      clientName: 'Client A',
      modelName: 'Model',
    })
    .expect(201);
  const participantB = await request(app.getHttpServer())
    .post('/api/projects/app-report/participants')
    .send({
      participantType: 'app',
      clientName: 'Client B',
      modelName: 'Model',
    })
    .expect(201);
  const topic = await request(app.getHttpServer())
    .post('/api/projects/app-report/topics')
    .send({
      title: 'Consensus app report',
      mode: 'consensus',
      maxTurns: 8,
    })
    .expect(201);

  return {
    topicId: topic.body.id as string,
    participantAId: participantA.body.id as string,
    participantBId: participantB.body.id as string,
  };
}

async function seedDraftingTopic(app: INestApplication) {
  await request(app.getHttpServer())
    .post('/api/projects')
    .send({ name: 'App Report' })
    .expect(201);

  const reporter = await request(app.getHttpServer())
    .post('/api/projects/app-report/participants')
    .send({
      participantType: 'app',
      clientName: 'Reporter',
      modelName: 'Model',
    })
    .expect(201);
  const reviewer = await request(app.getHttpServer())
    .post('/api/projects/app-report/participants')
    .send({
      participantType: 'app',
      clientName: 'Reviewer',
      modelName: 'Model',
    })
    .expect(201);
  const topic = await request(app.getHttpServer())
    .post('/api/projects/app-report/topics')
    .send({
      title: 'App report topic',
      mode: 'consensus',
      maxTurns: 2,
    })
    .expect(201);

  const topicId = topic.body.id as string;
  const memberAId = reporter.body.id as string;
  const memberBId = reviewer.body.id as string;

  await request(app.getHttpServer())
    .post(`/api/projects/app-report/topics/${topicId}/messages`)
    .send({
      participantId: memberAId,
      content: 'Opening statement',
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/api/projects/app-report/topics/${topicId}/messages`)
    .send({
      participantId: memberBId,
      content: 'Closing the debate turn limit',
    })
    .expect(201);

  return {
    topicId,
    reporterId: memberBId,
    reviewerId: memberAId,
  };
}

async function completeReviewing(
  app: INestApplication,
  topicId: string,
  reporterId: string,
  reviewerId: string,
) {
  await request(app.getHttpServer())
    .post(`/api/projects/app-report/topics/${topicId}/messages`)
    .send({
      participantId: reviewerId,
      content: 'Review feedback',
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/api/projects/app-report/topics/${topicId}/messages`)
    .send({
      participantId: reporterId,
      content: 'Reporter feedback',
    })
    .expect(201);
}

async function submitMessage(
  app: INestApplication,
  topicId: string,
  participantId: string,
  content: string,
  options: { debateSignal?: string } = {},
) {
  await request(app.getHttpServer())
    .post(`/api/projects/app-report/topics/${topicId}/messages`)
    .send({ participantId, content, ...options })
    .expect(201);
}
