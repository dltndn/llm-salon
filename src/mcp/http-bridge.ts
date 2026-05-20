import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { resolveRunningServerBaseUrl } from '../cli/running-server';
import { McpToolError } from './errors';
import { McpToolName } from './tools';

type ProjectStatus = {
  id: string;
  slug: string;
  name: string;
  status: string;
};

type ProjectDetails = ProjectStatus & {
  topics?: Array<{
    id: string;
    title: string;
    mode: string;
    phase: string;
    maxRounds: number | null;
    maxTurns: number | null;
    currentRound: number;
    currentTurnIndex: number;
  }>;
  participants?: Array<{ anonymousName: string }>;
};

export type ServerStatus = {
  version: string;
  projects: Array<{
    projectId: string;
    slug: string;
    name: string;
    phase: string | null;
    status: string;
  }>;
  host: '127.0.0.1';
  port: number;
};

export class McpHttpBridge {
  async callTool(name: McpToolName, args: Record<string, unknown>) {
    switch (name) {
      case 'create_project':
        return this.createProject(args);
      case 'get_server_status':
        return this.getServerStatus();
      case 'get_project_status':
        return this.getProjectStatus(args);
      case 'join_project':
        return this.joinProject(args);
      case 'create_topic':
        return this.createTopic(args);
      case 'add_document':
        return this.addDocument(args);
      case 'get_context':
        return this.getContext(args);
      case 'get_turn':
        return this.getTurn(args);
      case 'is_my_turn':
        return this.isMyTurn(args);
      case 'submit_message':
        return this.submitMessage(args);
      case 'get_report_status':
        return this.getReportStatus(args);
    }
  }

  async getServerStatus(): Promise<ServerStatus> {
    const baseUrl = await resolveRunningServerBaseUrl();
    const projects = await requestJson<ProjectStatus[]>(
      `${baseUrl}/api/projects?audience=anonymous`,
    );
    const projectDetails = await Promise.all(
      projects.map((project) =>
        requestJson<ProjectDetails>(
          `${baseUrl}/api/projects/${project.slug}?audience=anonymous`,
        ),
      ),
    );

    return {
      version: await readPackageVersion(),
      projects: projectDetails.map((project) => ({
        projectId: project.id,
        slug: project.slug,
        name: project.name,
        phase: project.topics?.[0]?.phase ?? null,
        status: project.status,
      })),
      host: '127.0.0.1',
      port: Number(new URL(baseUrl).port),
    };
  }

  private async createProject(args: Record<string, unknown>) {
    const baseUrl = await resolveRunningServerBaseUrl();
    const project = await requestJson<ProjectDetails>(
      `${baseUrl}/api/projects?audience=anonymous`,
      {
        method: 'POST',
        body: { name: readString(args, 'name') },
      },
    );

    return {
      projectId: project.id,
      slug: project.slug,
      url: `${baseUrl}/projects/${project.slug}`,
    };
  }

  private async getProjectStatus(args: Record<string, unknown>) {
    const baseUrl = await resolveRunningServerBaseUrl();
    const slug = await this.resolveProjectSlug(
      baseUrl,
      readString(args, 'projectIdOrSlug'),
    );
    const project = await requestJson<ProjectDetails>(
      `${baseUrl}/api/projects/${slug}?audience=anonymous`,
    );
    const topic = project.topics?.[0];

    if (!topic) {
      throw new McpToolError({
        error: 'PROJECT_HAS_NO_TOPIC',
        message: 'Project has no topic.',
      });
    }

    const [turn, documents] = await Promise.all([
      requestJson<{
        currentMember: string | null;
        serverTime: string;
        topicVersion: number;
      }>(
        `${baseUrl}/api/projects/${slug}/topics/${topic.id}/turn?audience=anonymous`,
      ),
      requestJson<unknown[]>(
        `${baseUrl}/api/projects/${slug}/documents?topicId=${encodeURIComponent(
          topic.id,
        )}&audience=anonymous`,
      ),
    ]);

    return {
      phase: topic.phase,
      mode: topic.mode,
      currentRound: topic.currentRound,
      maxRounds: topic.maxRounds,
      currentTurnIndex: topic.currentTurnIndex,
      maxTurns: topic.maxTurns,
      currentMember: turn.currentMember,
      reporterMember: null,
      participants: project.participants ?? [],
      topic: { title: topic.title, mode: topic.mode },
      documents,
      serverTime: turn.serverTime,
      topicVersion: turn.topicVersion,
    };
  }

  private async joinProject(args: Record<string, unknown>) {
    const baseUrl = await resolveRunningServerBaseUrl();
    const slug = await this.resolveProjectSlug(baseUrl, readString(args, 'projectId'));

    return requestJson(`${baseUrl}/api/projects/${slug}/participants?audience=anonymous`, {
      method: 'POST',
      body: {
        participantType: 'app',
        clientName: readString(args, 'clientName'),
        modelName: readString(args, 'modelName'),
      },
    });
  }

  private async createTopic(args: Record<string, unknown>) {
    const baseUrl = await resolveRunningServerBaseUrl();
    const slug = await this.resolveProjectSlug(baseUrl, readString(args, 'projectId'));
    const topic = await requestJson<{ id: string }>(
      `${baseUrl}/api/projects/${slug}/topics?audience=anonymous`,
      {
        method: 'POST',
        body: optionalBody(args, [
          'title',
          'description',
          'mode',
          'maxRounds',
          'maxTurns',
        ]),
      },
    );

    return { topicId: topic.id };
  }

  private async addDocument(args: Record<string, unknown>) {
    const baseUrl = await resolveRunningServerBaseUrl();
    const slug = await this.resolveProjectSlug(baseUrl, readString(args, 'projectId'));
    const document = await requestJson<{ id: string }>(
      `${baseUrl}/api/projects/${slug}/documents?audience=anonymous`,
      {
        method: 'POST',
        body: optionalBody(args, ['topicId', 'fileName', 'content']),
      },
    );

    return { documentId: document.id };
  }

  private async getContext(args: Record<string, unknown>) {
    const baseUrl = await resolveRunningServerBaseUrl();
    const slug = await this.resolveProjectSlug(baseUrl, readString(args, 'projectId'));
    const topicId = readString(args, 'topicId');

    return requestJson(
      `${baseUrl}/api/projects/${slug}/topics/${topicId}/context?audience=anonymous`,
    );
  }

  private async getTurn(args: Record<string, unknown>) {
    const baseUrl = await resolveRunningServerBaseUrl();
    const slug = await this.resolveProjectSlug(baseUrl, readString(args, 'projectId'));
    const topicId = readString(args, 'topicId');
    const participantId = readOptionalString(args, 'participantId');
    const query = participantId
      ? `?participantId=${encodeURIComponent(participantId)}&audience=anonymous`
      : '?audience=anonymous';

    return requestJson(
      `${baseUrl}/api/projects/${slug}/topics/${topicId}/turn${query}`,
    );
  }

  private async isMyTurn(args: Record<string, unknown>) {
    const turn = (await this.getTurn(args)) as {
      isMyTurn?: boolean;
      currentMember: string | null;
      phase: string;
      serverTime: string;
      topicVersion: number;
    };

    return {
      isMyTurn: turn.isMyTurn === true,
      currentMember: turn.currentMember,
      phase: turn.phase,
      serverTime: turn.serverTime,
      topicVersion: turn.topicVersion,
    };
  }

  private async submitMessage(args: Record<string, unknown>) {
    const baseUrl = await resolveRunningServerBaseUrl();
    const slug = await this.resolveProjectSlug(baseUrl, readString(args, 'projectId'));
    const topicId = readString(args, 'topicId');

    try {
      return await requestJson(
        `${baseUrl}/api/projects/${slug}/topics/${topicId}/messages?audience=anonymous`,
        {
          method: 'POST',
          body: {
            participantId: readString(args, 'participantId'),
            content: readString(args, 'content'),
          },
        },
      );
    } catch (error) {
      if (error instanceof McpHttpError && error.body.error === 'WrongTurnError') {
        throw new McpToolError({
          error: 'WRONG_TURN',
          currentMember: parseCurrentMember(error.body.message),
          message: error.body.message,
        });
      }

      throw error;
    }
  }

  private async getReportStatus(args: Record<string, unknown>) {
    const baseUrl = await resolveRunningServerBaseUrl();
    const slug = await this.resolveProjectSlug(baseUrl, readString(args, 'projectId'));
    const topicId = readString(args, 'topicId');

    return requestJson(
      `${baseUrl}/api/projects/${slug}/topics/${topicId}/report?audience=anonymous`,
    );
  }

  private async resolveProjectSlug(baseUrl: string, projectIdOrSlug: string) {
    const projects = await requestJson<ProjectStatus[]>(
      `${baseUrl}/api/projects?audience=anonymous`,
    );
    const project = projects.find(
      (candidate) =>
        candidate.slug === projectIdOrSlug || candidate.id === projectIdOrSlug,
    );

    return project?.slug ?? projectIdOrSlug;
  }
}

export async function readPackageVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(resolve(__dirname, '..', '..', 'package.json'), 'utf8'),
  ) as { version?: unknown };

  return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
}

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
};

class McpHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: unknown; message?: unknown },
    url: string,
  ) {
    super(typeof body.message === 'string' ? body.message : `HTTP ${status} from ${url}`);
    this.name = 'McpHttpError';
  }
}

async function requestJson<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new McpHttpError(response.status, body, url);
  }

  return (await response.json()) as T;
}

async function readErrorBody(
  response: Response,
): Promise<{ error?: unknown; message?: unknown }> {
  try {
    return (await response.json()) as { error?: unknown; message?: unknown };
  } catch {
    return { message: response.statusText };
  }
}

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new McpToolError({
      error: 'INVALID_PARAMS',
      message: `${key} is required.`,
    });
  }

  return value;
}

function readOptionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function optionalBody(args: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys
      .filter((key) => args[key] !== undefined)
      .map((key) => [key, args[key]]),
  );
}

function parseCurrentMember(message: unknown): string | null {
  if (typeof message !== 'string') {
    return null;
  }

  return message.match(/Current participant: (.+)$/u)?.[1] ?? null;
}
