import { readFile } from 'node:fs/promises';

import { Command, CommandRunner, Option, SubCommand } from 'nest-commander';

import { postJson } from './http-client';
import { resolveRunningServerBaseUrl } from './running-server';

type TopicCreateOptions = {
  file?: string;
};

@SubCommand({
  name: 'create',
  arguments: '<project>',
  description: 'Create a topic from a text file',
})
export class TopicCreateCommand extends CommandRunner {
  async run(passedParams: string[], options: TopicCreateOptions): Promise<void> {
    const [projectSlug] = passedParams;

    if (!options.file) {
      throw new Error('--file is required.');
    }

    const fileContents = await readFile(options.file, 'utf8');
    const [rawTitle, ...descriptionLines] = fileContents.split(/\r?\n/u);
    const title = rawTitle.trim();

    if (title === '') {
      throw new Error('Topic file first line must be a title.');
    }

    const baseUrl = await resolveRunningServerBaseUrl();
    const topic = await postJson<{ id: string; title: string }>(
      `${baseUrl}/api/projects/${projectSlug}/topics`,
      {
        title,
        description: descriptionLines.join('\n').trim() || undefined,
      },
    );

    console.log(`${topic.id}\t${topic.title}`);
  }

  @Option({
    flags: '--file <path>',
    description: 'Text file whose first line is the topic title',
  })
  parseFile(value: string): string {
    return value;
  }
}

@Command({
  name: 'topic',
  subCommands: [TopicCreateCommand],
  description: 'Manage topics',
})
export class TopicCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
