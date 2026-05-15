import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

export function resolveAutoMigrateEnabled(
  argv: readonly string[],
  autoMigrate?: boolean,
): boolean {
  return resolveAutoMigrateFlag(argv, autoMigrate ?? true);
}

export function resolveAutoMigrateFlag(
  argv: readonly string[],
  defaultValue: boolean,
): boolean {
  let autoMigrate = defaultValue;

  for (const argument of argv) {
    if (argument === '--auto-migrate') {
      autoMigrate = true;
    }

    if (argument === '--no-auto-migrate') {
      autoMigrate = false;
    }
  }

  return autoMigrate;
}

export async function runPrismaMigrateDeploy(): Promise<void> {
  const prismaCliEntrypoint = require.resolve('prisma/build/index.js');
  const projectRoot = resolve(__dirname, '..', '..');

  try {
    await execFileAsync(
      process.execPath,
      [prismaCliEntrypoint, 'migrate', 'deploy'],
      {
        cwd: projectRoot,
        env: process.env,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim()
        : error instanceof Error
          ? error.message
          : 'Unknown Prisma migration failure.';

    throw new Error(`Failed to run "prisma migrate deploy": ${message}`);
  }
}
