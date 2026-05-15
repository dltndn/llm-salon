import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('AppConfigModule boot integration', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
    jest.clearAllMocks();
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

  it('runs Prisma migrate deploy when auto-migrate is enabled and DATABASE_URL is available', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'llm-salon-config-'));
    const stdout = {
      log: jest.fn(),
    };
    const runPrismaMigrateDeploy = jest.fn().mockResolvedValue(undefined);

    process.env = {
      ...originalEnv,
      LLM_SALON_HOME: tempRoot,
      LLM_SALON_PORT: undefined,
      LLM_SALON_ENV_FILE: undefined,
    };

    try {
      await writeFile(
        join(tempRoot, '.env'),
        'DATABASE_URL="postgresql://localhost:5432/llm_salon"\n',
        'utf8',
      );

      jest.doMock('../../prisma/prisma.migrate', () => {
        const actual = jest.requireActual('../../prisma/prisma.migrate');
        return {
          ...actual,
          runPrismaMigrateDeploy,
        };
      });

      const { bootstrap } = await import('../../main');
      const app = await bootstrap({ autoMigrate: true, listen: false, stdout });

      expect(runPrismaMigrateDeploy).toHaveBeenCalledTimes(1);

      await app.close();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips Prisma migrate deploy on first boot when DATABASE_URL is missing', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'llm-salon-config-'));
    const stdout = {
      log: jest.fn(),
    };
    const runPrismaMigrateDeploy = jest.fn().mockResolvedValue(undefined);

    process.env = {
      ...originalEnv,
      LLM_SALON_HOME: tempRoot,
      LLM_SALON_PORT: undefined,
      LLM_SALON_ENV_FILE: undefined,
      DATABASE_URL: undefined,
    };

    try {
      jest.doMock('../../prisma/prisma.migrate', () => {
        const actual = jest.requireActual('../../prisma/prisma.migrate');
        return {
          ...actual,
          runPrismaMigrateDeploy,
        };
      });

      const { bootstrap } = await import('../../main');
      const app = await bootstrap({ autoMigrate: true, listen: false, stdout });

      expect(runPrismaMigrateDeploy).not.toHaveBeenCalled();
      expect(stdout.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Skipping Prisma migrate deploy for this first boot',
        ),
      );

      await app.close();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
