import { Command, CommandRunner, SubCommand } from 'nest-commander';

import { bootstrap } from '../main';
import { ProjectsService } from '../projects/projects.service';
import {
  readServerLock,
  resolveServerLockPath,
  isPidAlive,
} from './server-lock';
import { fetchJson } from './http-client';

type ProjectSummary = {
  slug: string;
  name: string;
  status: string;
};

@SubCommand({
  name: 'list',
  description: 'Print all project metadata',
})
export class ProjectListCommand extends CommandRunner {
  async run(): Promise<void> {
    const projects = await this.loadProjects();

    for (const project of projects) {
      console.log(`${project.slug}\t${project.name}\t${project.status}`);
    }
  }

  private async loadProjects(): Promise<ProjectSummary[]> {
    const lockPath = resolveServerLockPath(process.env);
    const lock = await readServerLock(lockPath);

    if (lock && isPidAlive(lock.pid)) {
      try {
        return await fetchJson<ProjectSummary[]>(
          `http://127.0.0.1:${lock.port}/api/projects?audience=human`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `llm-salon server lock is active, but HTTP project list failed: ${message}`,
        );
      }
    }

    const app = await bootstrap({ autoMigrate: true, listen: false });

    try {
      return (await app
        .get(ProjectsService)
        .listProjects('human')) as ProjectSummary[];
    } finally {
      await app.close();
    }
  }
}

@Command({
  name: 'project',
  subCommands: [ProjectListCommand],
  description: 'Manage projects',
})
export class ProjectCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
