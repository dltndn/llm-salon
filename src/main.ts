import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number.parseInt(process.env.LLM_SALON_PORT ?? '4477', 10);

  await app.listen(port, '127.0.0.1');
}

void bootstrap();
