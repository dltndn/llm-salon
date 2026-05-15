import { access, copyFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './env.schema';

export const DEFAULT_LLM_SALON_HOME = join(homedir(), '.llm-salon');

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

export function resolveBundledEnvExamplePath(): string {
  return resolve(__dirname, '..', '..', '.env.example');
}

export async function prepareLlmSalonHome(
  env: NodeJS.ProcessEnv = process.env,
  stdout: Pick<Console, 'log'> = console,
): Promise<{ homePath: string; envFilePath: string; createdEnvFile: boolean }> {
  const homePath = resolveLlmSalonHome(env);
  const envFilePath = resolveLlmSalonEnvFilePath(env);

  await mkdir(homePath, { recursive: true });

  try {
    await access(envFilePath);

    return {
      homePath,
      envFilePath,
      createdEnvFile: false,
    };
  } catch {
    await copyFile(resolveBundledEnvExamplePath(), envFilePath);
    stdout.log(
      `Created ${envFilePath} from .env.example. Fill in the keys you plan to use and restart the server.`,
    );

    return {
      homePath,
      envFilePath,
      createdEnvFile: true,
    };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveLlmSalonEnvFilePath(),
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
