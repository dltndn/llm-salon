import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  acquireServerLock,
  assertNoActiveServerLock,
  readServerLock,
  resolveServerLockPath,
  writeServerLock,
} from '../server-lock';

describe('server lock', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'llm-salon-lock-'));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('resolves the lock path under LLM_SALON_HOME', () => {
    expect(resolveServerLockPath({ LLM_SALON_HOME: tempRoot })).toBe(
      join(tempRoot, 'server.lock'),
    );
  });

  it('writes and reads PID and port', async () => {
    const lockPath = join(tempRoot, 'server.lock');

    await writeServerLock(lockPath, { pid: 123, port: 4477 });

    await expect(readServerLock(lockPath)).resolves.toEqual({
      pid: 123,
      port: 4477,
    });
    await expect(readFile(lockPath, 'utf8')).resolves.toBe(
      '{"pid":123,"port":4477}\n',
    );
  });

  it('blocks when the lock PID is alive', async () => {
    const lockPath = join(tempRoot, 'server.lock');
    await writeServerLock(lockPath, { pid: process.pid, port: 4477 });

    await expect(assertNoActiveServerLock(lockPath)).rejects.toThrow(
      `llm-salon is already running on port 4477 with PID ${process.pid}.`,
    );
  });

  it('atomically acquires a new lock before server boot', async () => {
    const lockPath = join(tempRoot, 'server.lock');

    await expect(
      acquireServerLock(lockPath, { pid: process.pid, port: 4477 }),
    ).resolves.toBeUndefined();
    await expect(
      acquireServerLock(lockPath, { pid: process.pid, port: 4478 }),
    ).rejects.toThrow(
      `llm-salon is already running on port 4477 with PID ${process.pid}.`,
    );
  });

  it('removes stale lock files', async () => {
    const lockPath = join(tempRoot, 'server.lock');
    await writeFile(lockPath, '{"pid":999999999,"port":4477}\n', 'utf8');

    await expect(assertNoActiveServerLock(lockPath)).resolves.toBeUndefined();
    await expect(readServerLock(lockPath)).resolves.toBeNull();
  });
});
