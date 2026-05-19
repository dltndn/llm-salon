import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { fetchJson } from '../cli/http-client';
import { resolveRunningServerBaseUrl } from '../cli/running-server';

type ProjectStatus = {
  slug: string;
  name: string;
  status: string;
};

type ProjectDetails = ProjectStatus & {
  topics?: Array<{ phase: string }>;
};

export type ServerStatus = {
  version: string;
  projects: Array<{
    slug: string;
    name: string;
    phase: string | null;
    status: string;
  }>;
  host: '127.0.0.1';
  port: number;
};

export class McpHttpBridge {
  async getServerStatus(): Promise<ServerStatus> {
    const baseUrl = await resolveRunningServerBaseUrl();
    const projects = await fetchJson<ProjectStatus[]>(
      `${baseUrl}/api/projects?audience=anonymous`,
    );
    const projectDetails = await Promise.all(
      projects.map((project) =>
        fetchJson<ProjectDetails>(
          `${baseUrl}/api/projects/${project.slug}?audience=anonymous`,
        ),
      ),
    );

    return {
      version: await readPackageVersion(),
      projects: projectDetails.map((project) => ({
        slug: project.slug,
        name: project.name,
        phase: project.topics?.[0]?.phase ?? null,
        status: project.status,
      })),
      host: '127.0.0.1',
      port: Number(new URL(baseUrl).port),
    };
  }
}

export async function readPackageVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(resolve(__dirname, '..', '..', 'package.json'), 'utf8'),
  ) as { version?: unknown };

  return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
}
