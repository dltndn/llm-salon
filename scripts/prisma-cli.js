#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const prismaCliEntrypoint = require.resolve('prisma/build/index.js');
const cliArgs = process.argv.slice(2);

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
