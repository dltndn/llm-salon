import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadEnvFileIntoProcessEnv } from '../env.file';

describe('loadEnvFileIntoProcessEnv', () => {
  it('loads missing values from the env file without overriding existing env', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'llm-salon-env-file-'));
    const envFilePath = join(tempRoot, '.env');
    const env: NodeJS.ProcessEnv = {
      DATABASE_URL: 'postgresql://existing/value',
    };

    try {
      await writeFile(
        envFilePath,
        [
          '# comment',
          'DATABASE_URL="postgresql://from/file"',
          'GOOGLE_API_KEY=google-key',
          "export OPENAI_API_KEY='openai-key'",
          '',
        ].join('\n'),
        'utf8',
      );

      await loadEnvFileIntoProcessEnv(envFilePath, env);

      expect(env.DATABASE_URL).toBe('postgresql://existing/value');
      expect(env.GOOGLE_API_KEY).toBe('google-key');
      expect(env.OPENAI_API_KEY).toBe('openai-key');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('preserves quoted DATABASE_URL values when followed by an inline comment', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'llm-salon-env-file-'));
    const envFilePath = join(tempRoot, '.env');
    const env: NodeJS.ProcessEnv = {};

    try {
      await writeFile(
        envFilePath,
        'DATABASE_URL="postgresql://user:pa#ss@127.0.0.1:5432/db?schema=public" # local db\n',
        'utf8',
      );

      await loadEnvFileIntoProcessEnv(envFilePath, env);

      expect(env.DATABASE_URL).toBe(
        'postgresql://user:pa#ss@127.0.0.1:5432/db?schema=public',
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
