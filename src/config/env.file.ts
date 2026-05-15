import { readFile } from 'node:fs/promises';

function parseEnvValue(rawValue: string): string {
  const trimmedValue = rawValue.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
}

export async function loadEnvFileIntoProcessEnv(
  envFilePath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const fileContents = await readFile(envFilePath, 'utf8');

  for (const line of fileContents.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      continue;
    }

    const normalizedLine = trimmedLine.startsWith('export ')
      ? trimmedLine.slice('export '.length)
      : trimmedLine;
    const separatorIndex = normalizedLine.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();

    if (key === '' || env[key] !== undefined) {
      continue;
    }

    env[key] = parseEnvValue(normalizedLine.slice(separatorIndex + 1));
  }
}
