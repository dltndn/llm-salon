#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join, resolve } = require('node:path');

function expandHomeDirectory(pathValue) {
  if (pathValue === '~') {
    return homedir();
  }

  if (pathValue.startsWith('~/')) {
    return join(homedir(), pathValue.slice(2));
  }

  return pathValue;
}

function resolveLlmSalonHome(env) {
  return resolve(
    expandHomeDirectory(env.LLM_SALON_HOME ?? join(homedir(), '.llm-salon')),
  );
}

function resolveEnvFilePath(env) {
  return env.LLM_SALON_ENV_FILE ?? join(resolveLlmSalonHome(env), '.env');
}

function parseEnvValue(rawValue) {
  const trimmedValue = rawValue.trim();
  const quoteCharacter = trimmedValue[0];

  if (quoteCharacter === '"' || quoteCharacter === "'") {
    for (let index = 1; index < trimmedValue.length; index += 1) {
      if (
        trimmedValue[index] === quoteCharacter &&
        trimmedValue[index - 1] !== '\\'
      ) {
        return trimmedValue.slice(1, index);
      }
    }
  }

  const commentIndex = trimmedValue.indexOf(' #');
  return commentIndex >= 0
    ? trimmedValue.slice(0, commentIndex).trimEnd()
    : trimmedValue;
}

function loadEnvFileIntoProcessEnv(envFilePath, env) {
  const fileContents = readFileSync(envFilePath, 'utf8');

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

const prismaCliEntrypoint = require.resolve('prisma/build/index.js');
const cliArgs = process.argv.slice(2);

try {
  loadEnvFileIntoProcessEnv(resolveEnvFilePath(process.env), process.env);
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}

if (cliArgs[0] === 'generate' && !cliArgs.includes('--allow-no-models')) {
  cliArgs.push('--allow-no-models');
}

const result = spawnSync(process.execPath, [prismaCliEntrypoint, ...cliArgs], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
