import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      const { bootstrap } = await import('../../main');
      const app = await bootstrap({ autoMigrate: false, listen: false, stdout });

      const envContents = await readFile(join(tempRoot, '.env'), 'utf8');
      expect(envContents).toContain('OPENAI_API_KEY=');
      expect(stdout.log).toHaveBeenCalledTimes(1);

      await app.close();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing .env on boot', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'llm-salon-config-'));
    const stdout = {
      log: jest.fn(),
    };
    const existingEnvContents = 'LLM_SALON_PORT=4999\n';

    process.env = {
      ...originalEnv,
      LLM_SALON_HOME: tempRoot,
      LLM_SALON_PORT: undefined,
      LLM_SALON_ENV_FILE: undefined,
    };

    try {
      await writeFile(join(tempRoot, '.env'), existingEnvContents, 'utf8');

      const { bootstrap } = await import('../../main');
      const app = await bootstrap({ autoMigrate: false, listen: false, stdout });

      const envContents = await readFile(join(tempRoot, '.env'), 'utf8');
      expect(envContents).toBe(existingEnvContents);
      expect(stdout.log).not.toHaveBeenCalled();

      await app.close();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
