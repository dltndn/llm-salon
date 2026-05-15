import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { prepareLlmSalonHome } from '../config.module';

describe('AppConfigModule boot integration', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  it('creates .env from the bundled template on first boot', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'llm-salon-config-'));
    const stdout = {
      log: jest.fn(),
    };

    process.env = {
      ...originalEnv,
      LLM_SALON_HOME: tempRoot,
    };

    try {
      const prepared = await prepareLlmSalonHome(process.env, stdout);

      expect(prepared.createdEnvFile).toBe(true);
      expect(stdout.log).toHaveBeenCalledTimes(1);

      const envContents = await readFile(join(tempRoot, '.env'), 'utf8');
      expect(envContents).toContain('OPENAI_API_KEY=');

      const { AppModule } = await import('../../app.module');
      const app = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
      });

      await app.close();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
