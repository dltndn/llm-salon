import { Module } from '@nestjs/common';

import { EnvCommand, EnvInitCommand } from './env-init.command';
import { JoinCommand } from './join.command';
import { ProjectCommand, ProjectListCommand } from './project-list.command';
import { StartCommand } from './start.command';
import { TopicCommand, TopicCreateCommand } from './topic-create.command';

@Module({
  providers: [
    EnvCommand,
    EnvInitCommand,
    JoinCommand,
    ProjectCommand,
    ProjectListCommand,
    StartCommand,
    TopicCommand,
    TopicCreateCommand,
  ],
})
export class CliModule {}
