#!/usr/bin/env node
import 'reflect-metadata';

import { CommandFactory } from 'nest-commander';

import { CliModule } from './cli.module';

void CommandFactory.run(CliModule, {
  cliName: 'llm-salon',
  logger: false,
  serviceErrorHandler: (error: Error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
