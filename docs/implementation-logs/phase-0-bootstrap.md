# Phase 0: Repository bootstrap and infrastructure

## Entry: 2026-05-15 Task 0.1

**Worker context:**
- Phase: Phase 0
- Task: Task 0.1: pnpm workspace and NestJS scaffolding
- Dependencies reviewed:
  - `docs/specs/01-architecture.md`
  - `docs/specs/08-security.md`
  - `docs/implementation-logs/README.md`

**What was done:**
- Bootstrapped a minimal NestJS 10 + Express app with strict TypeScript, ESLint, Jest, and `pnpm` metadata.
- Added `src/main.ts`, `src/app.module.ts`, and `src/http/health.controller.ts` with binding to `127.0.0.1` and default port `4477`.
- Added automated `/health` coverage and removed the zero-test pass-through from the test script.

**Why it matters for the next worker:**
- The project now has a stable `/health` route and a working build/test baseline for later feature work.
- Runtime smoke checks that bind `127.0.0.1` require elevated execution in this environment.

**Dependency impact:**
- Unblocked Task 0.2 and Task 0.3 by establishing the Nest bootstrap and command scripts expected by later work.

**Files touched:**
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `tsconfig.build.json`
- `nest-cli.json`
- `eslint.config.mjs`
- `jest.config.ts`
- `src/main.ts`
- `src/app.module.ts`
- `src/http/health.controller.ts`
- `src/http/health.controller.spec.ts`

**Commit:**
- `fc39d31fcd68af1ce5f5dc649ccfe0f3d461879d`

**Verification completed:**
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/nest build`
- [x] `./node_modules/.bin/eslint "{src,test}/**/*.ts"`
- [x] `./node_modules/.bin/jest --runInBand`
- [x] Runtime `/health` smoke check on `127.0.0.1`

**Not verified:**
- [ ] Literal `pnpm` binary on `PATH` in this shell

**Open risks or follow-ups:**
- `/health` coverage is controller-level, not full HTTP e2e.

**Instructions for the next worker:**
- Preserve `127.0.0.1` binding in `src/main.ts`.
- Read the config bootstrap helpers before changing boot order.

## Entry: 2026-05-15 Task 0.2

**Worker context:**
- Phase: Phase 0
- Task: Task 0.2: Config module and `LLM_SALON_HOME` boot guarantee
- Dependencies reviewed:
  - Task 0.1
  - `docs/specs/01-architecture.md`
  - `docs/specs/08-security.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added first-boot home/env preparation, bundled `.env.example`, and `@nestjs/config` integration.
- Split config responsibilities into path resolution, filesystem bootstrap, module wiring, and env normalization.
- Added validation/fallback logic for `LLM_SALON_PORT`, `LLM_SALON_CONTEXT_PROFILE`, and `LLM_SALON_OUTPUT_LANGUAGE`.
- Added regression tests for invalid env values, first-boot `.env` creation, existing `.env` preservation, and env-file parsing behavior used before Prisma boot.

**Why it matters for the next worker:**
- Boot now depends on the order: prepare home → resolve env file → load env values → import `AppModule`.
- `LLM_SALON_ENV_FILE` is an internal bridge used so pre-Nest boot work and Nest config use the same env file path.

**Dependency impact:**
- Unblocked Task 0.3 by making `.env` available before boot-time Prisma work.
- Established the config helpers future CLI/bootstrap work should reuse instead of re-deriving paths.

**Files touched:**
- `.env.example`
- `package.json`
- `pnpm-lock.yaml`
- `src/main.ts`
- `src/app.module.ts`
- `src/config/config.bootstrap.ts`
- `src/config/config.module.ts`
- `src/config/config.paths.ts`
- `src/config/env.file.ts`
- `src/config/env.schema.ts`
- `src/config/__tests__/config.module.spec.ts`
- `src/config/__tests__/env.file.spec.ts`
- `src/config/__tests__/env.schema.spec.ts`

**Commit:**
- `25931c331a56e01ca320e9608f36b245b50f1fe0`

**Verification completed:**
- [x] `./node_modules/.bin/jest src/config/__tests__/env.schema.spec.ts src/config/__tests__/config.module.spec.ts src/config/__tests__/env.file.spec.ts --runInBand`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/nest build`

**Not verified:**
- [ ] Explicit regression for CLI-side wrapper reuse of the env loader

**Open risks or follow-ups:**
- The standalone Prisma CLI wrapper duplicates a small env-loading path rather than importing the TypeScript helper directly.

**Instructions for the next worker:**
- Do not bypass `prepareLlmSalonHome()` or `loadEnvFileIntoProcessEnv()` in new bootstrap paths.
- Preserve OS env precedence over file-loaded values.

## Entry: 2026-05-15 Task 0.3

**Worker context:**
- Phase: Phase 0
- Task: Task 0.3: PostgreSQL / Prisma bootstrap and automatic migrations
- Dependencies reviewed:
  - Task 0.1
  - Task 0.2
  - `docs/specs/04-database.md`
  - `docs/specs/09-cli.md`

**What was done:**
- Added empty Prisma schema, initial `0001_init` migration, and `PrismaModule` / `PrismaService`.
- Added boot-time migration support with default-on auto-migrate and `--no-auto-migrate` override.
- Added a Prisma CLI wrapper so `generate` works on an empty schema and CLI commands load the same `LLM_SALON_HOME/.env` source as runtime boot.
- Fixed boot order so env values load before `prisma migrate deploy`.
- Added port bind retry (`4477` through `+10`) and a first-boot exception that skips auto-migrate only when `.env` was just generated and `DATABASE_URL` is still unset.

**Why it matters for the next worker:**
- Prisma-related boot logic now runs before Nest imports `AppModule`.
- `scripts/prisma-cli.js` is part of the contract for local Prisma commands in this repo while the schema remains empty.
- Startup now has a documented first-run setup branch: the server may boot without running Prisma only on the same boot that created `.env` and found no `DATABASE_URL`.

**Dependency impact:**
- Unblocked Phase 1 schema work by establishing the baseline Prisma client, migration folder, and migration execution path.

**Files touched:**
- `package.json`
- `pnpm-lock.yaml`
- `prisma/schema.prisma`
- `prisma/migrations/0001_init/migration.sql`
- `prisma/migrations/migration_lock.toml`
- `scripts/prisma-cli.js`
- `src/main.ts`
- `src/app.module.ts`
- `src/prisma/prisma.migrate.ts`
- `src/prisma/prisma.migrate.spec.ts`
- `src/prisma/prisma.module.ts`
- `src/prisma/prisma.service.ts`
- `src/config/env.file.ts`
- `src/config/__tests__/config.module.spec.ts`
- `src/config/__tests__/env.file.spec.ts`
- `src/startup/port.binding.ts`
- `src/startup/port.binding.spec.ts`

**Commit:**
- `705bcc4e472a3b1713e9fa671903cd370c94b2a8`

**Verification completed:**
- [x] `node scripts/prisma-cli.js generate`
- [x] `./node_modules/.bin/jest src/prisma/prisma.migrate.spec.ts src/config/__tests__/config.module.spec.ts src/config/__tests__/env.file.spec.ts --runInBand`
- [x] `./node_modules/.bin/jest src/startup/port.binding.spec.ts --runInBand`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint src/main.ts src/startup/port.binding.ts src/startup/port.binding.spec.ts src/config/__tests__/config.module.spec.ts`
- [x] `./node_modules/.bin/nest build`
- [x] Runtime boot with `--no-auto-migrate` creates `.env` and serves `/health`
- [x] Runtime `/health` returns `200 OK`

**Not verified:**
- [ ] Local PostgreSQL 15+ instance for controller-side final checkpoint
- [ ] Full Phase 0 checkpoint with live `prisma migrate deploy` on a locally running PostgreSQL from this shell session

**Open risks or follow-ups:**
- In this environment, local PostgreSQL was not running during the final top-level checkpoint, so live DB verification relied on task-level disposable verification rather than the final integrated smoke test.
- The Prisma CLI wrapper and runtime env loader still duplicate a small parser surface.
- After exhausting 10 retries, port bind currently rethrows the final `EADDRINUSE` rather than wrapping it in a custom user-facing error.

**Instructions for the next worker:**
- Keep the migration step before `AppModule` import if boot behavior changes.
- Reuse `resolveAutoMigrateEnabled()` when adding future boot/CLI entrypoints.
