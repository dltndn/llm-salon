import 'reflect-metadata';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { prepareLlmSalonHome } from './config/config.bootstrap';
import { loadEnvFileIntoProcessEnv } from './config/env.file';
import { LLM_SALON_ENV_FILE_PATH_ENV } from './config/config.paths';
import {
  resolveAutoMigrateEnabled,
  runPrismaMigrateDeploy,
} from './prisma/prisma.migrate';
import { bindWithPortRetry } from './startup/port.binding';

type BootstrapOptions = {
  autoMigrate?: boolean;
  argv?: readonly string[];
  listen?: boolean;
  stdout?: Pick<Console, 'log'>;
};

export async function bootstrap(
  options: BootstrapOptions = {},
): Promise<INestApplication> {
  const {
    autoMigrate,
    argv = process.argv.slice(2),
    listen = true,
    stdout = console,
  } = options;
  const { homePath, envFilePath, createdEnvFile } = await prepareLlmSalonHome(
    process.env,
    stdout,
  );
  process.env.LLM_SALON_HOME = homePath;
  process.env[LLM_SALON_ENV_FILE_PATH_ENV] = envFilePath;
  await loadEnvFileIntoProcessEnv(envFilePath);

  const autoMigrateEnabled = resolveAutoMigrateEnabled(argv, autoMigrate);
  const shouldSkipFirstBootMigrate =
    createdEnvFile && !process.env.DATABASE_URL && autoMigrateEnabled;

  if (shouldSkipFirstBootMigrate) {
    stdout.log(
      `Skipping Prisma migrate deploy for this first boot because ${envFilePath} was just created and DATABASE_URL is not set. Add DATABASE_URL to ${envFilePath} and restart the server.`,
    );
  } else if (autoMigrateEnabled) {
    await runPrismaMigrateDeploy();
  }

  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  if (listen) {
    const configService = app.get(ConfigService);
    const port = configService.get<number>('LLM_SALON_PORT', 4477);

    await bindWithPortRetry(
      (candidatePort, host) => app.listen(candidatePort, host),
      port,
      '127.0.0.1',
    );
  }

  return app;
}

if (require.main === module) {
  void bootstrap();
}
