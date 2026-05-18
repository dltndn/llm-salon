import {
  readServerLock,
  resolveServerLockPath,
  isPidAlive,
} from './server-lock';

export async function resolveRunningServerBaseUrl(): Promise<string> {
  const lock = await readServerLock(resolveServerLockPath(process.env));

  if (!lock || !isPidAlive(lock.pid)) {
    throw new Error(
      'llm-salon server is not running. Start it with llm-salon start <project>.',
    );
  }

  return `http://127.0.0.1:${lock.port}`;
}
