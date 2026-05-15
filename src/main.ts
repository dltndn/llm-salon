import 'reflect-metadata';

import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { prepareLlmSalonHome } from './config/config.module';

type BootstrapOptions = {
  listen?: boolean;
  stdout?: Pick<Console, 'log'>;
};

export async function bootstrap(
  options: BootstrapOptions = {},
): Promise<INestApplication> {
  const { listen = true, stdout = console } = options;
  const { homePath } = await prepareLlmSalonHome(process.env, stdout);
  process.env.LLM_SALON_HOME = homePath;

  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);

  if (listen) {
    const configService = app.get(ConfigService);
    const port = configService.get<number>('LLM_SALON_PORT', 4477);

    await app.listen(port, '127.0.0.1');
  }

  return app;
}

if (require.main === module) {
  void bootstrap();
}
