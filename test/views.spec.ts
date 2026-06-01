import { INestApplication } from '@nestjs/common';
import {
  MessageKind,
  ParticipantStatus,
  ParticipantType,
  ProjectStatus,
  ReportStatus,
  TopicMode,
  TopicPhase,
  TurnStatus,
} from '@prisma/client';
import * as request from 'supertest';

import { uuidSnippet } from '../src/common/mcp-prompt-copy';
import { createTestApp } from './test-app';

const now = new Date('2026-05-18T00:00:00.000Z');
const projectId = '11111111-1111-4111-8111-111111111111';
const topicId = '22222222-2222-4222-8222-222222222222';
const participantAId = '33333333-3333-4333-8333-333333333333';
const participantBId = '44444444-4444-4444-8444-444444444444';

class InMemoryViewsPrisma {
  constructor(private readonly includeReport = true) {}

  readonly project = {
    findMany: jest.fn(() =>
      Promise.resolve([
        {
          id: projectId,
          slug: 'view-project',
          name: 'View Project',
          status: ProjectStatus.created,
          createdAt: now,
          updatedAt: now,
          _count: {
            topics: 1,
            participants: 2,
          },
        },
      ]),
    ),
    findUnique: jest.fn(({ where }) =>
      Promise.resolve(
        where.slug === 'view-project'
          ? {
              id: projectId,
              slug: 'view-project',
              name: 'View Project',
              status: ProjectStatus.created,
              createdAt: now,
              updatedAt: now,
              topics: [
                {
                  id: topicId,
                  projectId,
                  title: 'Dashboard Topic',
                  description: 'A focused dashboard test',
                  mode: TopicMode.consensus,
                  phase: TopicPhase.debating,
                  maxRounds: null,
                  maxTurns: null,
                  currentRound: 0,
                  currentTurnIndex: 1,
                  reporterParticipantId: null,
                  deletedAt: null,
                  createdAt: now,
                  updatedAt: now,
                },
              ],
              participants: [
                this.participant(participantAId, 'Codex / gpt-5.4', 1),
                this.participant(participantBId, 'Claude / Sonnet', 2),
              ],
            }
          : null,
      ),
    ),
  };

  readonly message = {
    findMany: jest.fn(() =>
      Promise.resolve([
        {
          id: '77777777-7777-4777-8777-777777777777',
          projectId,
          topicId,
          participantId: participantAId,
          kind: MessageKind.statement,
          phase: TopicPhase.debating,
          content: 'Human visible message',
          turnIndex: 1,
          roundIndex: 0,
          createdAt: now,
          participant: {
            displayName: 'Codex / gpt-5.4',
            anonymousName: 'Member A',
          },
        },
      ]),
    ),
  };

  readonly turn = {
    findFirst: jest.fn(() =>
      Promise.resolve({
        id: '55555555-5555-4555-8555-555555555555',
        projectId,
        topicId,
        currentParticipantId: participantBId,
        turnIndex: 2,
        roundIndex: 0,
        phase: TopicPhase.debating,
        status: TurnStatus.in_progress,
        createdAt: now,
        updatedAt: now,
        currentParticipant: {
          id: participantBId,
          displayName: 'Claude / Sonnet',
        },
      }),
    ),
  };

  readonly document = {
    findMany: jest.fn(() => Promise.resolve([])),
  };

  readonly report = {
    findFirst: jest.fn(() =>
      Promise.resolve(
        this.includeReport
          ? {
              id: '88888888-8888-4888-8888-888888888888',
              status: ReportStatus.drafting,
              draftContent: 'Draft report content',
              finalContent: 'Final report content',
              filePath: '/tmp/final-report.md',
            }
          : null,
      ),
    ),
  };

  private participant(id: string, displayName: string, joinOrder: number) {
    return {
      id,
      projectId,
      displayName,
      anonymousName: `Member ${joinOrder === 1 ? 'A' : 'B'}`,
      participantType: ParticipantType.app,
      providerName: null,
      modelName: joinOrder === 1 ? 'gpt-5.4' : 'Sonnet',
      clientName: joinOrder === 1 ? 'Codex' : 'Claude',
      status: ParticipantStatus.active,
      joinOrder,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }
}

describe('EJS dashboard views', () => {
  let app: INestApplication;
  let prisma: InMemoryViewsPrisma;

  beforeEach(async () => {
    prisma = new InMemoryViewsPrisma();
    app = await createTestApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('renders the project index', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);

    expect(response.text).toContain('View Project');
    expect(response.text).toContain('/projects/view-project');
    expect(response.text).toContain('1</dd>');
    expect(response.text).toContain('2</dd>');
  });

  it('renders the project dashboard with human display names', async () => {
    const response = await request(app.getHttpServer())
      .get(`/projects/view-project?topic=${topicId}`)
      .expect(200);

    expect(response.text).toContain('Dashboard Topic');
    expect(response.text).toContain('Codex / gpt-5.4');
    expect(response.text).toContain('Claude / Sonnet');
    expect(response.text).toContain('Codex / gpt-5.4 (Member A)');
    expect(response.text).toContain('Human visible message');
    expect(response.text).toContain('Topic: Dashboard Topic');
    expect(response.text).toContain(uuidSnippet(projectId));
    expect(response.text).toContain(uuidSnippet(topicId));
    expect(response.text).toContain('Join the LLM-Salon project using projectId');
    expect(response.text).toContain('call join_project with this projectId');
    expect(response.text).toContain('get_project_status');
    expect(response.text).toContain('stop after reporting successful registration');
    expect(response.text).toContain('Use topicId');
    expect(response.text).toContain('topic participation tools');
    expect(response.text).toContain(
      'submit_message only when the topic contract says it is your turn',
    );
    expect(response.text).not.toContain('call get_turn and wait_for_turn');
    expect(response.text).toContain('Copy UUID');
    expect(response.text).toContain('Copy MCP prompt');
    expect(response.text).toContain('id="participants-heading"');
    expect(response.text).toContain('Draft report content');
    expect(response.text).toContain('Final report content');
    expect(response.text).toContain('data-project-slug="view-project"');
    expect(response.text).toContain('src="/public/dashboard.js"');
  });

  it('serves dashboard static assets', async () => {
    await request(app.getHttpServer())
      .get('/public/dashboard.js')
      .expect('Content-Type', /javascript/)
      .expect(200);

    await request(app.getHttpServer())
      .get('/public/styles.css')
      .expect('Content-Type', /css/)
      .expect(200);
  });

  it('serves dashboard static assets outside the repository cwd', async () => {
    const originalCwd = process.cwd();

    try {
      process.chdir('/private/tmp');
      await request(app.getHttpServer())
        .get('/public/dashboard.js')
        .expect('Content-Type', /javascript/)
        .expect(200);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('renders an empty report state', async () => {
    await app.close();
    prisma = new InMemoryViewsPrisma(false);
    app = await createTestApp(prisma);

    const response = await request(app.getHttpServer())
      .get(`/projects/view-project?topic=${topicId}`)
      .expect(200);

    expect(response.text).toContain('No report draft yet.');
  });

  it('returns 404 for unknown projects', async () => {
    await request(app.getHttpServer()).get('/projects/missing').expect(404);
  });

  it('shows the participant section when the project has no topics', async () => {
    prisma.project.findUnique.mockImplementationOnce(({ where }) =>
      Promise.resolve(
        where.slug === 'view-project'
          ? {
              id: projectId,
              slug: 'view-project',
              name: 'View Project',
              status: ProjectStatus.created,
              createdAt: now,
              updatedAt: now,
              topics: [],
              participants: [
                {
                  id: participantAId,
                  projectId,
                  displayName: 'Codex / gpt-5.4',
                  anonymousName: 'Member A',
                  participantType: ParticipantType.app,
                  providerName: null,
                  modelName: 'gpt-5.4',
                  clientName: 'Codex',
                  status: ParticipantStatus.active,
                  joinOrder: 1,
                  joinedAt: now,
                  createdAt: now,
                  updatedAt: now,
                },
              ],
            }
          : null,
      ),
    );

    const response = await request(app.getHttpServer())
      .get('/projects/view-project')
      .expect(200);

    expect(response.text).toContain('id="participants-heading"');
    expect(response.text).toContain('Codex / gpt-5.4');
    expect(response.text).not.toContain('Codex / gpt-5.4 (Member A)');
    expect(response.text).toContain('No topics yet.');
  });
});
