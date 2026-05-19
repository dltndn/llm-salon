import { Module } from '@nestjs/common';

import { EnvCommand, EnvInitCommand } from './env-init.command';
import { JoinCommand } from './join.command';
import { ProviderAddCommand, ProviderCommand } from './provider-add.command';
import { ProjectCommand, ProjectListCommand } from './project-list.command';
import { StartCommand } from './start.command';
import { TopicCommand, TopicCreateCommand } from './topic-create.command';

@Module({
  providers: [
    EnvCommand,
    EnvInitCommand,
    JoinCommand,
    ProviderAddCommand,
    ProviderCommand,
    ProjectCommand,
    ProjectListCommand,
    StartCommand,
    TopicCommand,
    TopicCreateCommand,
  ],
})
export class CliModule {}
