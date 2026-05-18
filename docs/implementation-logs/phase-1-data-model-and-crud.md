# Phase 1: Data model and core CRUD

## Entry: 2026-05-15 Task 1.1

**Worker context:**
- Phase: Phase 1
- Task: Task 1.1: Prisma schema — ENUMs and seven tables
- Dependencies reviewed:
  - Task 0.3
  - Phase 0 log
  - `docs/specs/02-domain-model.md`
  - `docs/specs/04-database.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added Prisma models for `projects`, `topics`, `participants`, `documents`, `messages`, `turns`, and `reports`.
- Added Prisma-mapped PostgreSQL ENUMs for participant, project, topic, turn, report, and message states.
- Added migration `0002_domain_tables` with cascade foreign keys, participant partial unique indexes, required retrieval indexes, and the 32KB `messages.content` CHECK constraint.
- Added static migration coverage and an explicit opt-in DB constraint regression test for duplicate anonymous names.

**Why it matters for the next worker:**
- Downstream CRUD services can now use generated Prisma types for Phase 1 domain tables.
- Prisma does not model partial indexes or CHECK constraints directly; preserve those constraints in SQL migrations and static migration tests.
- DB-backed Prisma tests require both `DATABASE_URL` and `LLM_SALON_RUN_DB_TESTS=1` to avoid mutating an arbitrary developer database.

**Dependency impact:**
- Satisfies Task 1.1 and unblocks Task 1.2 project/topic CRUD.
- Establishes the participant uniqueness behavior required by Task 1.3.

**Files touched:**
- `prisma/schema.prisma`
- `prisma/migrations/0002_domain_tables/migration.sql`
- `src/prisma/prisma.schema.spec.ts`
- `src/prisma/prisma.unique.spec.ts`

**Commit:**
- `9f201c9f16f7b86a3b42038cdf77fe980fa5d803`

**Verification completed:**
- [x] `DATABASE_URL=postgresql://user:pass@localhost:5432/db node scripts/prisma-cli.js validate`
- [x] `node scripts/prisma-cli.js generate`
- [x] `./node_modules/.bin/jest src/prisma/prisma.schema.spec.ts src/prisma/prisma.unique.spec.ts --runInBand`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint src/prisma/prisma.schema.spec.ts src/prisma/prisma.unique.spec.ts`
- [x] `git diff --check`
- [x] Fresh local PostgreSQL migration: `DATABASE_URL=postgresql://dev@127.0.0.1:55432/llm_salon_phase1 node scripts/prisma-cli.js migrate deploy`
- [x] Fresh DB introspection: `DATABASE_URL=postgresql://dev@127.0.0.1:55432/llm_salon_phase1 node scripts/prisma-cli.js db pull --print`
- [x] Opt-in DB test: `LLM_SALON_RUN_DB_TESTS=1 DATABASE_URL=postgresql://dev@127.0.0.1:55432/llm_salon_phase1 ./node_modules/.bin/jest src/prisma/prisma.unique.spec.ts --runInBand`
- [x] Subagent spec review and code-quality review completed; review findings were addressed and re-reviewed.

**Not verified:**
- [ ] `pnpm` wrapper command names, because this shell uses local binaries and Node wrapper commands.

**Open risks or follow-ups:**
- Prisma `db pull --print` warns that the `messages_content_max_32kb` CHECK constraint is not represented in Prisma Client; keep the migration SQL and static assertion as the source for that DB-only constraint.

**Instructions for the next worker:**
- For Task 1.2, use Prisma Client models rather than raw SQL for normal CRUD.
- Do not remove the explicit participant partial unique indexes from the migration.
- If adding DB-backed tests, keep them gated behind `LLM_SALON_RUN_DB_TESTS=1`.

## Entry: 2026-05-15 Task 1.2

**Worker context:**
- Phase: Phase 1
- Task: Task 1.2: Project/Topic CRUD services and REST
- Dependencies reviewed:
  - Task 1.1
  - Phase 1 log
  - `docs/specs/02-domain-model.md`
  - `docs/specs/04-database.md`
  - `docs/specs/05-api.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added `POST /api/projects`, `GET /api/projects`, and `GET /api/projects/:slug`.
- Added `POST /api/projects/:slug/topics` with default `phase=preparing` and `mode=consensus`.
- Added global Nest `ValidationPipe`, class-validator DTOs, whitespace trimming, and 400 behavior for invalid payloads.
- Added project slug generation with database unique-conflict retry.
- Added minimal human/anonymous response shaping for project detail so anonymous participant payloads expose only `anonymousName`.
- Added Supertest coverage with an in-memory Prisma service and an opt-in Prisma-backed test path.

**Why it matters for the next worker:**
- Task 1.3 can rely on project lookup by slug and on global DTO validation already being active.
- Anonymous serialization is intentionally minimal here; Task 2.1 still owns the full DTO/interceptor system.
- DB-backed REST tests require both `DATABASE_URL` and `LLM_SALON_RUN_DB_TESTS=1` to avoid accidental writes to arbitrary local databases.

**Dependency impact:**
- Satisfies Task 1.2 and unblocks Task 1.3 participant registration.
- Introduces `class-validator` and `class-transformer` runtime dependencies for DTO validation.

**Files touched:**
- `package.json`
- `pnpm-lock.yaml`
- `src/app.module.ts`
- `src/main.ts`
- `src/common/audience.ts`
- `src/projects/*`
- `src/topics/*`
- `test/projects.spec.ts`

**Commit:**
- `8264f49fc95e36023ce8b34cf8c77cc4941b3bff`

**Verification completed:**
- [x] `./node_modules/.bin/jest test/projects.spec.ts --runInBand`
- [x] `LLM_SALON_RUN_DB_TESTS=1 DATABASE_URL=postgresql://dev@127.0.0.1:55432/llm_salon_phase1 ./node_modules/.bin/jest test/projects.spec.ts --runInBand`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint src/main.ts src/app.module.ts src/common src/projects src/topics test/projects.spec.ts`
- [x] `./node_modules/.bin/nest build`
- [x] Subagent spec review and code-quality review completed; review findings were addressed and re-reviewed.

**Not verified:**
- [ ] Literal `pnpm` commands, because `pnpm` is not available on this shell PATH; local binaries and the pinned pnpm via npm were used instead.

**Open risks or follow-ups:**
- Default test runs use the in-memory Prisma fake; run the opt-in DB test when validating schema/database integration.
- Full anonymization guard/interceptor remains deferred to Task 2.1.

**Instructions for the next worker:**
- Reuse `normalizeAudience` and the existing project lookup flow when adding participant routes.
- Keep participant duplicate handling aligned with the database partial unique indexes from Task 1.1.
- Supertest local listener binding may require elevated permission in this environment.

## Entry: 2026-05-18 Task 1.3

**Worker context:**
- Phase: Phase 1
- Task: Task 1.3: Participant registration and anonymous names
- Dependencies reviewed:
  - Task 1.1
  - Task 1.2
  - Phase 1 log
  - `docs/specs/02-domain-model.md`
  - `docs/specs/04-database.md`
  - `docs/specs/05-api.md`
  - `docs/specs/06-mcp.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added `POST /api/projects/:slug/participants` for app and provider participant registration.
- Added transactional anonymous-name assignment using project row locking plus `MAX(join_order)`.
- Added `Member A` through `Member Z`, then `Member AA` style anonymous-name generation.
- Added duplicate app registration mapping to `DuplicateAppRegistrationError` with HTTP 409.
- Added registration rejection when any project topic is `drafting` or beyond.
- Added participant serializers for human responses and anonymous registration responses.
- Shared HTTP global filters/pipes through `applyHttpGlobals()` so runtime and tests use the same validation/error mapping.

**Why it matters for the next worker:**
- Task 1.4 can call the participant/project REST APIs instead of using Prisma directly.
- Phase 2 can rely on stable `participantId`, `anonymousName`, and `joinOrder` in anonymous registration responses for MCP join compatibility.
- Anonymous project-detail participant lists still expose only `anonymousName`; full anonymization guards remain Task 2.1 scope.

**Dependency impact:**
- Satisfies Task 1.3 and unblocks Task 1.4.
- Introduces domain errors and a small HTTP exception filter that later error mappings can extend.

**Files touched:**
- `src/app.module.ts`
- `src/main.ts`
- `src/common/errors/*`
- `src/http/apply-http-globals.ts`
- `src/participants/*`
- `src/projects/project.presenter.ts`
- `test/participants.spec.ts`
- `test/projects.spec.ts`
- `test/test-app.ts`

**Commit:**
- `cadb2797b0d4ba5293c3f551f4dbac85aee77a86`

**Verification completed:**
- [x] `./node_modules/.bin/jest src/participants/__tests__/anonymous-name.spec.ts test/participants.spec.ts test/projects.spec.ts --runInBand`
- [x] `LLM_SALON_RUN_DB_TESTS=1 DATABASE_URL=postgresql://dev@127.0.0.1:55432/llm_salon_phase1 ./node_modules/.bin/jest test/participants.spec.ts --runInBand`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint src/main.ts src/app.module.ts src/common src/http src/participants src/projects src/topics test`
- [x] `./node_modules/.bin/nest build`
- [x] `git diff --check`
- [x] Subagent spec review and code-quality review completed; review findings were addressed and final re-review approved.

**Not verified:**
- [ ] Literal `pnpm` commands, because `pnpm` is not available on this shell PATH.

**Open risks or follow-ups:**
- DB-backed participant tests remain opt-in behind `LLM_SALON_RUN_DB_TESTS=1` to avoid accidental writes to arbitrary databases.
- Registration lock is project-scoped; if later requirements allow per-topic independent registration windows, this will need revisiting.

**Instructions for the next worker:**
- Task 1.4 should consume the REST endpoints created in Tasks 1.2 and 1.3.
- Keep the project row lock in participant registration unless a stronger turn/registration lock is introduced.
- Do not start Phase 2 anonymization work until Task 1.4 is complete and logged.

## Entry: 2026-05-18 Task 1.4

**Worker context:**
- Phase: Phase 1
- Task: Task 1.4: CLI start/project list/env init
- Dependencies reviewed:
  - Task 1.1
  - Task 1.2
  - Task 1.3
  - Phase 1 log
  - `docs/specs/09-cli.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added a `nest-commander` CLI entrypoint exposed as `llm-salon`.
- Added `llm-salon start <project>` with home/env preparation, atomic `server.lock` acquisition, port override support, 10-attempt port auto-increment, browser launch, URL printing, and shutdown lock cleanup.
- Added first-boot handling so a newly copied `.env` with no `DATABASE_URL` skips migration, avoids project DB creation, prints setup guidance, and still opens/prints the project URL.
- Added `llm-salon project list`, using HTTP when a live server lock exists and a one-shot Nest application context otherwise.
- Added `llm-salon env init`.
- Added Phase 1 CLI coverage for `llm-salon topic create <project> --file <path>` and `llm-salon join <project> --client <name> --model <name>` so the CLI can create projects, topics, and participants.
- Added server lock tests covering lock path resolution, read/write, active PID blocking, atomic acquisition, and stale lock cleanup.
- Adjusted `bindWithPortRetry()` from 10 retries after the initial port to 10 total bind attempts, matching the CLI spec wording.

**Why it matters for the next worker:**
- Phase 2 can assume the local CLI can bootstrap the server, locate the running server through `server.lock`, and delegate project/topic/participant setup to the REST API.
- The lock file is now acquired before boot to prevent duplicate starts racing before the listener is ready.
- CLI commands that require a running server should use the lock-aware HTTP helpers in `src/cli/running-server.ts` and `src/cli/http-client.ts`.

**Dependency impact:**
- Satisfies Task 1.4 and completes the Phase 1 checkpoint.
- Introduces `nest-commander`, `open`, and `@types/inquirer`.
- `src/main.ts` now supports an `onListen` bootstrap hook so CLI startup can write the actual auto-incremented port to the lock file.

**Files touched:**
- `package.json`
- `pnpm-lock.yaml`
- `src/main.ts`
- `src/startup/port.binding.ts`
- `src/startup/port.binding.spec.ts`
- `src/cli/*`

**Commit:**
- `c3cd262ed7c61a9761a0c4f377a37dca0625d941`

**Verification completed:**
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint src test`
- [x] `./node_modules/.bin/nest build`
- [x] `./node_modules/.bin/jest src/cli/__tests__/server-lock.spec.ts src/startup/port.binding.spec.ts --runInBand`
- [x] `./node_modules/.bin/jest --runInBand` with elevated permission for Supertest listener binding
- [x] CLI smoke: `env init` created `.env` under a temp `LLM_SALON_HOME`.
- [x] CLI smoke: first `start` with a newly copied `.env` and no `DATABASE_URL` skipped migration/project DB creation, printed setup guidance, and printed `http://127.0.0.1:<port>/projects/<slug>`.
- [x] CLI smoke against temporary PostgreSQL: `start`, `/health`, duplicate `start` lock rejection, `project list`, `topic create`, and `join`.
- [x] CLI smoke: invalid `join` invocation returns exit code 1.
- [x] Subagent spec/code reviews completed; blocker findings and follow-up feedback were addressed.

**Not verified:**
- [ ] Literal `pnpm` commands, because `pnpm` is not available on this shell PATH; local binaries and the pinned pnpm via `npm exec` were used where needed.

**Open risks or follow-ups:**
- Task 1.4 intentionally implements only Phase 1 CLI surface plus the Phase 1 checkpoint commands. Remaining commands in `09-cli.md` such as `stop`, `status`, `provider add`, `logs`, and `mcp` remain future-phase work.
- `project list` treats an active lock with failing HTTP as an inconsistent running-server state and exits with an error rather than deleting the live lock.
- Default full Jest still skips opt-in DB mutation tests unless their environment flags are set.

**Instructions for the next worker:**
- Start Phase 2 only after confirming this Task 1.4 commit is present.
- Reuse the CLI lock and HTTP helpers for additional CLI commands instead of duplicating lock parsing.
- If implementing `llm-salon stop`, use the existing `server.lock` shape and remove the lock only after the target process is no longer running.
