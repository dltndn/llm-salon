import { access, copyFile, mkdir } from 'node:fs/promises';

import {
  resolveBundledEnvExamplePath,
  resolveLlmSalonEnvFilePath,
  resolveLlmSalonHome,
} from './config.paths';

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
