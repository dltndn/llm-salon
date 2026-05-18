import { Command, CommandRunner, Option } from 'nest-commander';

import { postJson } from './http-client';
import { resolveRunningServerBaseUrl } from './running-server';

type JoinOptions = {
  client?: string;
  model?: string;
};

@Command({
  name: 'join',
  arguments: '<project>',
  description: 'Register an LLM app participant',
})
export class JoinCommand extends CommandRunner {
  async run(passedParams: string[], options: JoinOptions): Promise<void> {
    const [projectSlug] = passedParams;

    if (!options.client || !options.model) {
      throw new Error('Both --client and --model are required.');
    }

    const baseUrl = await resolveRunningServerBaseUrl();
    const participant = await postJson<{
      anonymousName: string;
      joinOrder: number;
    }>(`${baseUrl}/api/projects/${projectSlug}/participants`, {
      participantType: 'app',
      clientName: options.client,
      modelName: options.model,
    });

    console.log(`${participant.anonymousName}\t${participant.joinOrder}`);
  }

  @Option({
    flags: '--client <name>',
    description: 'LLM app client name',
  })
  parseClient(value: string): string {
    return value;
  }

  @Option({
    flags: '--model <name>',
    description: 'LLM app model name',
  })
  parseModel(value: string): string {
    return value;
  }
}
