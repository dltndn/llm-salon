import { Command, CommandRunner, SubCommand } from 'nest-commander';

import { prepareLlmSalonHome } from '../config/config.bootstrap';

@SubCommand({
  name: 'init',
  description: 'Create ~/.llm-salon/.env from the bundled example if absent',
})
export class EnvInitCommand extends CommandRunner {
  async run(): Promise<void> {
    const { envFilePath, createdEnvFile } = await prepareLlmSalonHome(
      process.env,
      console,
    );

    if (!createdEnvFile) {
      console.log(`${envFilePath} already exists.`);
    }
  }
}

@Command({
  name: 'env',
  subCommands: [EnvInitCommand],
  description: 'Manage the local llm-salon environment',
})
export class EnvCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
