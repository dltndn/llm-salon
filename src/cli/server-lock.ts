import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { resolveLlmSalonHome } from '../config/config.paths';

export type ServerLock = {
  pid: number;
  port: number;
};

export function resolveServerLockPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveLlmSalonHome(env), 'server.lock');
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readServerLock(
  lockPath: string,
): Promise<ServerLock | null> {
  try {
    const lock = JSON.parse(await readFile(lockPath, 'utf8')) as ServerLock;

    return Number.isInteger(lock.pid) && Number.isInteger(lock.port)
      ? lock
      : null;
  } catch {
    return null;
  }
}

export async function assertNoActiveServerLock(
  lockPath: string,
): Promise<void> {
  const lock = await readServerLock(lockPath);

  if (!lock) {
    return;
  }

  if (isPidAlive(lock.pid)) {
    throw new Error(
      `llm-salon is already running on port ${lock.port} with PID ${lock.pid}.`,
    );
  }

  await rm(lockPath, { force: true });
}

export async function acquireServerLock(
  lockPath: string,
  lock: ServerLock,
): Promise<void> {
  await mkdir(dirname(lockPath), { recursive: true });

  try {
    const file = await open(lockPath, 'wx', 0o600);
    await file.writeFile(`${JSON.stringify(lock)}\n`, 'utf8');
    await file.close();
    return;
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'EEXIST'
    ) {
      throw error;
    }
  }

  await assertNoActiveServerLock(lockPath);
  await acquireServerLock(lockPath, lock);
}

export async function writeServerLock(
  lockPath: string,
  lock: ServerLock,
): Promise<void> {
  await mkdir(dirname(lockPath), { recursive: true });
  await writeFile(lockPath, `${JSON.stringify(lock)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}
