import {
  ChildProcessWithoutNullStreams,
  spawn,
  spawnSync,
} from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

jest.setTimeout(15000);

type JsonRpcResponse = {
  id: number;
  result?: {
    content?: Array<{ type: 'text'; text: string }>;
    structuredContent?: unknown;
    protocolVersion?: string;
    tools?: Array<{ name: string; outputSchema?: unknown }>;
    isError?: boolean;
  };
  error?: { message: string };
};

class McpChild {
  private readonly pending = new Map<
    number,
    (response: JsonRpcResponse) => void
  >();
  private nextId = 1;
  readonly stderr: string[] = [];

  constructor(readonly process: ChildProcessWithoutNullStreams) {
    let stdoutBuffer = '';

    process.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8');

      for (;;) {
        const newlineIndex = stdoutBuffer.indexOf('\n');

        if (newlineIndex === -1) {
          break;
        }

        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

        if (line.trim() === '') {
          continue;
        }

        const response = JSON.parse(line) as JsonRpcResponse;
        this.pending.get(response.id)?.(response);
        this.pending.delete(response.id);
      }
    });

    process.stderr.on('data', (chunk: Buffer) => {
      this.stderr.push(chunk.toString('utf8'));
    });
  }

  request(method: string, params?: unknown): Promise<JsonRpcResponse> {
    const id = this.nextId;
    this.nextId += 1;

    const response = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for MCP response to ${method}`));
      }, 5000);

      this.pending.set(id, (value) => {
        clearTimeout(timeout);
        resolve(value);
      });
    });

    this.process.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
    );

    return response;
  }

  notify(method: string, params?: unknown): void {
    this.process.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`,
    );
  }

  async close(): Promise<void> {
    this.process.stdin.end();
    this.process.kill();
  }
}

describe('MCP stdio server', () => {
  let app: INestApplication | undefined;
  let tempHome: string;
  let child: McpChild | undefined;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'llm-salon-mcp-'));
    previousHome = process.env.LLM_SALON_HOME;
    process.env.LLM_SALON_HOME = tempHome;
  });

  afterEach(async () => {
    await child?.close();
    child = undefined;

    if (app) {
      await app.close();
      app = undefined;
    }

    await rm(tempHome, { force: true, recursive: true });

    if (previousHome === undefined) {
      delete process.env.LLM_SALON_HOME;
    } else {
      process.env.LLM_SALON_HOME = previousHome;
    }
  });

  it('round-trips get_server_status through stdio and HTTP delegation', async () => {
    const prisma = new InMemoryPrisma();
    app = await createTestApp(prisma as unknown as PrismaService);
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as { port: number };
    await writeFile(
      join(tempHome, 'server.lock'),
      `${JSON.stringify({ pid: process.pid, port: address.port })}\n`,
      'utf8',
    );

    const projectResponse = await request(app.getHttpServer())
      .post('/api/projects')
      .send({ name: 'MCP Test Project' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/projects/mcp-test-project/topics')
      .send({ title: 'Round trip topic' })
      .expect(201);

    child = spawnMcp(tempHome);

    const init = await child.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'jest', version: '0.0.0' },
    });
    expect(init.error).toBeUndefined();
    expect(init.result?.protocolVersion).toBe('2025-06-18');
    child.notify('notifications/initialized');

    const tools = await child.request('tools/list');
    expect(tools.result?.tools).toEqual(
      expect.arrayContaining([
      expect.objectContaining({
        name: 'get_server_status',
        outputSchema: expect.objectContaining({ type: 'object' }),
      }),
      expect.objectContaining({
        name: 'wait_for_action',
        outputSchema: expect.objectContaining({ type: 'object' }),
      }),
      expect.objectContaining({
        name: 'submit_report_draft',
        outputSchema: expect.objectContaining({ type: 'object' }),
      }),
      expect.objectContaining({
        name: 'submit_report_final',
        outputSchema: expect.objectContaining({ type: 'object' }),
      }),
      ]),
    );
    const toolNames = (tools.result?.tools ?? []).map((tool) => tool.name);
    expect(toolNames).not.toEqual(
      expect.arrayContaining(['get_turn', 'is_my_turn', 'wait_for_turn']),
    );

    const response = await child.request('tools/call', {
      name: 'get_server_status',
      arguments: {},
    });
    const text = response.result?.content?.[0]?.text;

    expect(response.error).toBeUndefined();
    expect(text).toBeDefined();
    const expectedStatus = {
      version: '0.1.0',
      host: '127.0.0.1',
      port: address.port,
      projects: [
        {
          projectId: projectResponse.body.id,
          slug: 'mcp-test-project',
          name: 'MCP Test Project',
          phase: 'preparing',
          status: 'created',
        },
      ],
    };
    expect(JSON.parse(text as string)).toEqual(expectedStatus);
    expect(response.result?.structuredContent).toEqual(expectedStatus);
  });

  it('supports join, context, turn, submit, document, and report tools', async () => {
    const prisma = new InMemoryPrisma();
    app = await createTestApp(prisma as unknown as PrismaService);
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as { port: number };
    await writeFile(
      join(tempHome, 'server.lock'),
      `${JSON.stringify({ pid: process.pid, port: address.port })}\n`,
      'utf8',
    );

    child = spawnMcp(tempHome);
    await initializeChild(child);

    const project = await callTool<{
      projectId: string;
      slug: string;
      url: string;
    }>(child, 'create_project', { name: 'Tool Flow' });
    const participant = await callTool<{
      participantId: string;
      anonymousName: string;
      joinOrder: number;
    }>(child, 'join_project', {
      projectId: project.projectId,
      clientName: 'Codex',
      modelName: 'GPT-5',
    });
    const topic = await callTool<{ topicId: string }>(child, 'create_topic', {
      projectId: project.slug,
      title: 'Decide path',
      mode: 'options',
      maxTurns: 2,
    });
    const document = await callTool<{ documentId: string }>(
      child,
      'add_document',
      {
        projectId: project.projectId,
        topicId: topic.topicId,
        fileName: 'brief.txt',
        content: 'Use the smallest safe implementation.',
      },
    );
    const sharedDocument = await callTool<{ documentId: string }>(
      child,
      'add_document',
      {
        projectId: project.projectId,
        fileName: 'shared.txt',
        content: '/etc/hosts is an example path inside valid inline text.',
      },
    );
    const projectStatus = await callTool<{
      phase: string;
      mode: string;
      currentMember: string;
      documents: unknown[];
    }>(child, 'get_project_status', { projectIdOrSlug: project.projectId });
    const waitForAction = await callTool<{
      isActionable: boolean;
      action: string;
      assignedMember: string;
      wakeupReason: string;
      mySelf: string;
      topicVersion: number;
    }>(child, 'wait_for_action', {
      projectId: project.projectId,
      topicId: topic.topicId,
      participantId: participant.participantId,
      timeoutMs: 1000,
    });
    const context = await callTool<{
      systemPrompt: string;
      contextMessages: Array<{ role: string; content: string }>;
    }>(child, 'get_context', {
      projectId: project.projectId,
      topicId: topic.topicId,
      participantId: participant.participantId,
    });
    const submitted = await callTool<{
      messageId: string;
      nextMember: string | null;
      phaseAfter: string;
    }>(child, 'submit_message', {
      projectId: project.projectId,
      topicId: topic.topicId,
      participantId: participant.participantId,
      content: 'I prefer the direct implementation.',
    });
    const actionAfterSubmit = await callTool<{ topicVersion: number }>(
      child,
      'wait_for_action',
      {
        projectId: project.projectId,
        topicId: topic.topicId,
        participantId: participant.participantId,
        timeoutMs: 0,
      },
    );
    const report = await callTool<{ status: string; draftAvailable: boolean }>(
      child,
      'get_report_status',
      {
        projectId: project.projectId,
        topicId: topic.topicId,
      },
    );

    expect(project.url).toBe(`http://127.0.0.1:${address.port}/projects/tool-flow`);
    expect(participant).toMatchObject({
      anonymousName: 'Member A',
      joinOrder: 1,
    });
    expect(document.documentId).toBeDefined();
    expect(sharedDocument.documentId).toBeDefined();
    expect(projectStatus).toMatchObject({
      phase: 'preparing',
      mode: 'options',
      currentMember: 'Member A',
    });
    expect(projectStatus.documents).toHaveLength(2);
    expect(waitForAction).toMatchObject({
      isActionable: true,
      action: 'submit_debate_message',
      assignedMember: 'Member A',
      mySelf: 'Member A',
      wakeupReason: 'immediate',
    });
    expect(context.systemPrompt).toContain('You are Member A');
    expect(context.contextMessages.some((item) => item.role === 'assistant')).toBe(
      true,
    );
    expect(submitted).toMatchObject({
      nextMember: 'Member A',
      phaseAfter: 'debating',
    });
    expect(actionAfterSubmit.topicVersion).toBeGreaterThan(
      waitForAction.topicVersion,
    );
    expect(report).toEqual({
      status: 'none',
      draftAvailable: false,
      finalAvailable: false,
    });
    expect(JSON.stringify({
      projectStatus,
      waitForAction,
      context,
      submitted,
      report,
    })).not.toMatch(/displayName|providerName|clientName|modelName/u);
  });

  it('submits debateSignal through MCP and can trigger consensus early stop', async () => {
    const prisma = new InMemoryPrisma();
    app = await createTestApp(prisma as unknown as PrismaService);
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as { port: number };
    await writeFile(
      join(tempHome, 'server.lock'),
      `${JSON.stringify({ pid: process.pid, port: address.port })}\n`,
      'utf8',
    );

    child = spawnMcp(tempHome);
    await initializeChild(child);

    const project = await callTool<{ projectId: string; slug: string }>(
      child,
      'create_project',
      { name: 'Consensus MCP' },
    );
    const participantA = await callTool<{ participantId: string }>(
      child,
      'join_project',
      {
        projectId: project.projectId,
        clientName: 'Codex A',
        modelName: 'GPT-5',
      },
    );
    const participantB = await callTool<{ participantId: string }>(
      child,
      'join_project',
      {
        projectId: project.projectId,
        clientName: 'Codex B',
        modelName: 'GPT-5',
      },
    );
    const topic = await callTool<{ topicId: string }>(child, 'create_topic', {
      projectId: project.slug,
      title: 'Reach consensus',
      mode: 'consensus',
    });
    const providerId = '55555555-5555-4555-8555-555555555555';
    prisma.seedParticipant(project.slug, {
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
      topicId: topic.topicId,
      participantId: providerId,
      kind: MessageKind.statement,
      phase: TopicPhase.debating,
      content: 'Provider is ready.',
      debateSignal: DebateSignal.ReadyToFinalize,
    });

    const firstSubmit = await callTool<{ phaseAfter: string; nextMember: string }>(
      child,
      'submit_message',
      {
        projectId: project.projectId,
        topicId: topic.topicId,
        participantId: participantA.participantId,
        content: 'A is ready.',
        debateSignal: 'ready_to_finalize',
      },
    );
    const secondSubmit = await callTool<{
      phaseAfter: string;
      nextMember: string | null;
    }>(child, 'submit_message', {
      projectId: project.projectId,
      topicId: topic.topicId,
      participantId: participantB.participantId,
      content: 'B is ready.',
      debateSignal: 'ready_to_finalize',
    });
    expect(firstSubmit).toMatchObject({
      nextMember: 'Member B',
      phaseAfter: 'debating',
    });
    expect(secondSubmit).toMatchObject({
      nextMember: 'Member C',
      phaseAfter: 'debating',
    });

    const thirdSubmit = await callTool<{
      phaseAfter: string;
      nextMember: string | null;
    }>(child, 'submit_message', {
      projectId: project.projectId,
      topicId: topic.topicId,
      participantId: providerId,
      content: 'C is ready.',
      debateSignal: 'ready_to_finalize',
    });

    expect(thirdSubmit).toMatchObject({
      nextMember: 'Member A',
      phaseAfter: 'debating',
    });

    const fourthSubmit = await callTool<{
      phaseAfter: string;
      nextMember: string | null;
    }>(child, 'submit_message', {
      projectId: project.projectId,
      topicId: topic.topicId,
      participantId: participantA.participantId,
      content: 'A is ready again.',
      debateSignal: 'ready_to_finalize',
    });

    expect(fourthSubmit).toMatchObject({
      nextMember: null,
      phaseAfter: 'drafting',
    });
  });

  it('returns WRONG_TURN with the current anonymous member', async () => {
    const prisma = new InMemoryPrisma();
    app = await createTestApp(prisma as unknown as PrismaService);
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as { port: number };
    await writeFile(
      join(tempHome, 'server.lock'),
      `${JSON.stringify({ pid: process.pid, port: address.port })}\n`,
      'utf8',
    );

    child = spawnMcp(tempHome);
    await initializeChild(child);

    const project = await callTool<{ projectId: string }>(child, 'create_project', {
      name: 'Wrong Turn',
    });
    const first = await callTool<{ participantId: string }>(child, 'join_project', {
      projectId: project.projectId,
      clientName: 'First',
      modelName: 'Model',
    });
    const second = await callTool<{ participantId: string }>(child, 'join_project', {
      projectId: project.projectId,
      clientName: 'Second',
      modelName: 'Model',
    });
    const topic = await callTool<{ topicId: string }>(child, 'create_topic', {
      projectId: project.projectId,
      title: 'Wrong turn topic',
    });

    expect(first.participantId).toBeDefined();
    const response = await child.request('tools/call', {
      name: 'submit_message',
      arguments: {
        projectId: project.projectId,
        topicId: topic.topicId,
        participantId: second.participantId,
        content: 'Not my turn',
      },
    });

    expect(response.result?.isError).toBe(true);
    expect(response.result?.structuredContent).toEqual({
      error: 'WRONG_TURN',
      currentMember: 'Member A',
      message: 'Wrong turn. Current participant: Member A',
      statusCode: 409,
    });
  });

  it('submits app report draft and final through MCP tools', async () => {
    const prisma = new InMemoryPrisma();
    app = await createTestApp(prisma as unknown as PrismaService);
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as { port: number };
    await writeFile(
      join(tempHome, 'server.lock'),
      `${JSON.stringify({ pid: process.pid, port: address.port })}\n`,
      'utf8',
    );

    child = spawnMcp(tempHome);
    await initializeChild(child);

    const project = await callTool<{ projectId: string; slug: string }>(
      child,
      'create_project',
      { name: 'MCP Report Flow' },
    );
    const reporter = await callTool<{ participantId: string }>(child, 'join_project', {
      projectId: project.projectId,
      clientName: 'Reporter',
      modelName: 'GPT-5',
    });
    const reviewer = await callTool<{ participantId: string }>(child, 'join_project', {
      projectId: project.projectId,
      clientName: 'Reviewer',
      modelName: 'GPT-5',
    });
    const topic = await callTool<{ topicId: string }>(child, 'create_topic', {
      projectId: project.projectId,
      title: 'MCP report topic',
      mode: 'consensus',
      maxTurns: 2,
    });

    await callTool(child, 'submit_message', {
      projectId: project.projectId,
      topicId: topic.topicId,
      participantId: reporter.participantId,
      content: 'Opening',
    });
    await callTool(child, 'submit_message', {
      projectId: project.projectId,
      topicId: topic.topicId,
      participantId: reviewer.participantId,
      content: 'Closing',
    });

    const draft = await callTool<{ reportId: string; phaseAfter: string }>(
      child,
      'submit_report_draft',
      {
        projectId: project.projectId,
        topicId: topic.topicId,
        participantId: reviewer.participantId,
        content: '# Draft\n\nBody',
      },
    );

    expect(draft.phaseAfter).toBe('reviewing');

    await callTool(child, 'submit_message', {
      projectId: project.projectId,
      topicId: topic.topicId,
      participantId: reporter.participantId,
      content: 'Feedback from A',
    });
    await callTool(child, 'submit_message', {
      projectId: project.projectId,
      topicId: topic.topicId,
      participantId: reviewer.participantId,
      content: 'Feedback from B',
    });

    const final = await callTool<{ reportId: string; phaseAfter: string; filePath: string }>(
      child,
      'submit_report_final',
      {
        projectId: project.projectId,
        topicId: topic.topicId,
        participantId: reviewer.participantId,
        content: '# Final\n\nDone',
      },
    );

    expect(final.phaseAfter).toBe('finalized');
    expect(final.filePath).toContain(topic.topicId);
  });

  it('rejects document file paths and binary content through add_document', async () => {
    const prisma = new InMemoryPrisma();
    app = await createTestApp(prisma as unknown as PrismaService);
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as { port: number };
    await writeFile(
      join(tempHome, 'server.lock'),
      `${JSON.stringify({ pid: process.pid, port: address.port })}\n`,
      'utf8',
    );

    child = spawnMcp(tempHome);
    await initializeChild(child);

    const project = await callTool<{ projectId: string }>(child, 'create_project', {
      name: 'Document Rejection',
    });
    const pathResponse = await child.request('tools/call', {
      name: 'add_document',
      arguments: {
        projectId: project.projectId,
        fileName: '../secret.txt',
        content: 'safe text',
      },
    });
    const binaryResponse = await child.request('tools/call', {
      name: 'add_document',
      arguments: {
        projectId: project.projectId,
        fileName: 'binary.txt',
        content: 'bad\u0000content',
      },
    });

    expect(pathResponse.result?.isError).toBe(true);
    expect(binaryResponse.result?.isError).toBe(true);
  });

  it('returns a clear tool error when the HTTP server is not running', async () => {
    child = spawnMcp(tempHome);

    await child.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'jest', version: '0.0.0' },
    });

    const response = await child.request('tools/call', {
      name: 'get_server_status',
      arguments: {},
    });

    expect(response.result?.isError).toBe(true);
    expect(response.result?.content?.[0]?.text).toContain(
      'llm-salon server is not running',
    );
  });

  it('returns idle project status when the project has no topic', async () => {
    const prisma = new InMemoryPrisma();
    app = await createTestApp(prisma as unknown as PrismaService);
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as { port: number };
    await writeFile(
      join(tempHome, 'server.lock'),
      `${JSON.stringify({ pid: process.pid, port: address.port })}\n`,
      'utf8',
    );

    child = spawnMcp(tempHome);
    await initializeChild(child);

    const project = await callTool<{ projectId: string; slug: string }>(
      child,
      'create_project',
      { name: 'Idle Project' },
    );
    const status = await callTool<{
      phase: string | null;
      mode: string | null;
      currentRound: number | null;
      maxRounds: number | null;
      currentTurnIndex: number | null;
      maxTurns: number | null;
      currentMember: string | null;
      reporterMember: string | null;
      participants: unknown[];
      topic: unknown;
      documents: unknown[];
      serverTime: string;
      topicVersion: number | null;
    }>(child, 'get_project_status', { projectIdOrSlug: project.projectId });

    expect(status).toEqual({
      phase: null,
      mode: null,
      currentRound: null,
      maxRounds: null,
      currentTurnIndex: null,
      maxTurns: null,
      currentMember: null,
      reporterMember: null,
      participants: [],
      topic: null,
      documents: [],
      topicVersion: null,
      serverTime: expect.any(String),
    });
    expect(Date.parse(status.serverTime)).not.toBeNaN();
  });

  it('registers through join-only MCP flow without mutating topic state', async () => {
    const prisma = new InMemoryPrisma();
    app = await createTestApp(prisma as unknown as PrismaService);
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as { port: number };
    await writeFile(
      join(tempHome, 'server.lock'),
      `${JSON.stringify({ pid: process.pid, port: address.port })}\n`,
      'utf8',
    );

    child = spawnMcp(tempHome);
    await initializeChild(child);

    const project = await callTool<{ projectId: string; slug: string }>(
      child,
      'create_project',
      { name: 'Join Only' },
    );
    const participant = await callTool<{
      participantId: string;
      anonymousName: string;
      joinOrder: number;
    }>(child, 'join_project', {
      projectId: project.projectId,
      clientName: 'Codex',
      modelName: 'GPT-5',
    });
    const status = await callTool<{
      phase: string | null;
      topic: unknown;
      participants: Array<{ anonymousName: string }>;
      documents: unknown[];
    }>(child, 'get_project_status', { projectIdOrSlug: project.slug });

    expect(participant).toMatchObject({
      anonymousName: 'Member A',
      joinOrder: 1,
    });
    expect(status).toMatchObject({
      phase: null,
      topic: null,
      participants: [{ anonymousName: 'Member A' }],
      documents: [],
    });

    const projectDetails = await request(app.getHttpServer())
      .get(`/api/projects/${project.slug}?audience=anonymous`)
      .expect(200);
    const documents = await request(app.getHttpServer())
      .get(`/api/projects/${project.slug}/documents?audience=anonymous`)
      .expect(200);

    expect(projectDetails.body.topics).toEqual([]);
    expect(documents.body).toEqual([]);
  });

  it('prints the MCP install prompt from the CLI', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        'src/cli/main.ts',
        'mcp',
        'install-prompt',
      ],
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Add an MCP server named "llm-salon" using the command `llm-salon mcp`.',
    );
    expect(result.stdout).toContain(
      'When asked only to join a project, call join_project and then get_project_status.',
    );
    expect(result.stdout).toContain(
      'If no topic exists yet, stop after reporting successful registration',
    );
    expect(result.stdout).toContain(
      'before creating a topic, adding documents, or submitting messages',
    );
    expect(result.stderr).toBe('');
  });
});

async function initializeChild(child: McpChild) {
  const init = await child.request('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'jest', version: '0.0.0' },
  });

  expect(init.error).toBeUndefined();
  child.notify('notifications/initialized');
}

async function callTool<T>(
  child: McpChild,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await child.request('tools/call', {
    name,
    arguments: args,
  });

  expect(response.error).toBeUndefined();
  expect(response.result?.isError).not.toBe(true);
  return response.result?.structuredContent as T;
}

function spawnMcp(tempHome: string): McpChild {
  return new McpChild(
    spawn(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        'src/cli/main.ts',
        'mcp',
      ],
      {
        cwd: join(__dirname, '..'),
        env: {
          ...process.env,
          LLM_SALON_HOME: tempHome,
        },
      },
    ),
  );
}
