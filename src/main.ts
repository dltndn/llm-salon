import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { prepareLlmSalonHome } from './config/config.module';

async function bootstrap(): Promise<void> {
  const { homePath } = await prepareLlmSalonHome();
  process.env.LLM_SALON_HOME = homePath;

  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('LLM_SALON_PORT', 4477);

  await app.listen(port, '127.0.0.1');
}

void bootstrap();
