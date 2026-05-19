import { Command, CommandRunner, Option, SubCommand } from 'nest-commander';

import { postJson } from './http-client';
import { resolveRunningServerBaseUrl } from './running-server';

type ProviderAddOptions = {
  project?: string;
  model?: string;
};

@SubCommand({
  name: 'add',
  arguments: '<provider>',
  description: 'Register an API provider participant',
})
export class ProviderAddCommand extends CommandRunner {
  async run(
    passedParams: string[],
    options: ProviderAddOptions,
  ): Promise<void> {
    const [providerName] = passedParams;

    if (!options.project || !options.model) {
      throw new Error('Both --project and --model are required.');
    }

    const baseUrl = await resolveRunningServerBaseUrl();
    const participant = await postJson<{
      anonymousName: string;
      joinOrder: number;
    }>(`${baseUrl}/api/projects/${options.project}/participants`, {
      participantType: 'provider',
      providerName,
      modelName: options.model,
    });

    console.log(`${participant.anonymousName}\t${participant.joinOrder}`);
  }

  @Option({
    flags: '--project <project>',
    description: 'Project slug',
  })
  parseProject(value: string): string {
    return value;
  }

  @Option({
    flags: '--model <model>',
    description: 'Provider model name',
  })
  parseModel(value: string): string {
    return value;
  }
}

@Command({
  name: 'provider',
  subCommands: [ProviderAddCommand],
  description: 'Manage API provider participants',
})
export class ProviderCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
