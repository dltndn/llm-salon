import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const DEFAULT_LLM_SALON_HOME = join(homedir(), '.llm-salon');
export const LLM_SALON_ENV_FILE_PATH_ENV = 'LLM_SALON_ENV_FILE';

function expandHomeDirectory(pathValue: string): string {
  if (pathValue === '~') {
    return homedir();
  }

  if (pathValue.startsWith('~/')) {
    return join(homedir(), pathValue.slice(2));
  }

  return pathValue;
}

export function resolveLlmSalonHome(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return resolve(
    expandHomeDirectory(env.LLM_SALON_HOME ?? DEFAULT_LLM_SALON_HOME),
  );
}

export function resolveLlmSalonEnvFilePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveLlmSalonHome(env), '.env');
}

export function resolveConfiguredEnvFilePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.LLM_SALON_ENV_FILE ?? resolveLlmSalonEnvFilePath(env);
}

export function resolveBundledEnvExamplePath(): string {
  return resolve(__dirname, '..', '..', '.env.example');
}
