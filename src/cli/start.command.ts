import { rm } from 'node:fs/promises';

import type { INestApplication } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { prepareLlmSalonHome } from '../config/config.bootstrap';
import { bootstrap } from '../main';
import { ProjectsService } from '../projects/projects.service';
import { slugifyProjectName } from '../projects/slug';
import { openBrowser } from './browser';
import {
  acquireServerLock,
  resolveServerLockPath,
  writeServerLock,
} from './server-lock';

type StartOptions = {
  autoMigrate?: boolean;
  port?: number | string;
};

type ProjectResponse = {
  slug: string;
};

@Command({
  name: 'start',
  arguments: '<project>',
  description: 'Boot the local server and open a project dashboard',
})
export class StartCommand extends CommandRunner {
  async run(passedParams: string[], options: StartOptions): Promise<void> {
    const [projectName] = passedParams;
    const { homePath, createdEnvFile } = await prepareLlmSalonHome(
      process.env,
      console,
    );
    process.env.LLM_SALON_HOME = homePath;

    const requestedPort = this.resolveRequestedPort(options.port);
    const skipProjectCreation =
      createdEnvFile && process.env.DATABASE_URL === undefined;

    if (requestedPort !== undefined) {
      process.env.LLM_SALON_PORT = String(requestedPort);
    }

    const lockPath = resolveServerLockPath(process.env);
    let boundPort = requestedPort ?? Number(process.env.LLM_SALON_PORT ?? 4477);

    try {
      await acquireServerLock(lockPath, {
        pid: process.pid,
        port: boundPort,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return;
    }

    let app: INestApplication;

    try {
      app = await bootstrap({
        autoMigrate: skipProjectCreation ? false : options.autoMigrate,
        listen: true,
        onListen: (port) => {
          boundPort = port;
        },
      });
    } catch (error) {
      await rm(lockPath, { force: true });
      throw error;
    }

    try {
      await writeServerLock(lockPath, {
        pid: process.pid,
        port: boundPort,
      });

      const slug = slugifyProjectName(projectName);

      if (skipProjectCreation) {
        console.error(
          'DATABASE_URL is not set. Fill it in ~/.llm-salon/.env and restart to create the project.',
        );
      } else {
        await this.ensureProject(app.get(ProjectsService), projectName, slug);
      }

      const url = `http://127.0.0.1:${boundPort}/projects/${slug}`;

      try {
        await openBrowser(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Could not open browser automatically: ${message}`);
      }

      console.log(url);
      this.registerShutdown(lockPath, app.close.bind(app));
    } catch (error) {
      await rm(lockPath, { force: true });
      await app.close();
      throw error;
    }
  }

  @Option({
    flags: '--port <port>',
    description: 'Preferred server port',
  })
  parsePort(value: string): number {
    return Number(value);
  }

  @Option({
    flags: '--no-auto-migrate',
    description: 'Skip prisma migrate deploy before boot',
  })
  parseNoAutoMigrate(): boolean {
    return false;
  }

  private async ensureProject(
    projectsService: ProjectsService,
    projectName: string,
    slug: string,
  ): Promise<ProjectResponse> {
    try {
      return (await projectsService.getProjectBySlug(
        slug,
        'human',
      )) as ProjectResponse;
    } catch {
      return (await projectsService.createProject({
        name: projectName,
        slug,
      })) as ProjectResponse;
    }
  }

  private resolveRequestedPort(port: number | string | undefined): number | undefined {
    if (port === undefined) {
      return undefined;
    }

    const normalizedPort = Number(port);

    if (
      !Number.isInteger(normalizedPort) ||
      normalizedPort < 1 ||
      normalizedPort > 65535
    ) {
      throw new Error(`Invalid port: ${port}`);
    }

    return normalizedPort;
  }

  private registerShutdown(
    lockPath: string,
    closeApp: () => Promise<void>,
  ): void {
    const shutdown = async () => {
      await rm(lockPath, { force: true });
      await closeApp();
      process.exit(0);
    };

    process.once('SIGINT', () => void shutdown());
    process.once('SIGTERM', () => void shutdown());
  }
}
