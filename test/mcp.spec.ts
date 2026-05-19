import {
  ChildProcessWithoutNullStreams,
  spawn,
  spawnSync,
} from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
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

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'llm-salon-mcp-'));
  });

  afterEach(async () => {
    await child?.close();
    child = undefined;

    if (app) {
      await app.close();
      app = undefined;
    }

    await rm(tempHome, { force: true, recursive: true });
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

    await request(app.getHttpServer())
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
    expect(tools.result?.tools).toEqual([
      expect.objectContaining({
        name: 'get_server_status',
        outputSchema: expect.objectContaining({ type: 'object' }),
      }),
    ]);

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
    expect(result.stderr).toBe('');
  });
});

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
