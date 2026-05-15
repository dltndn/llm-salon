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
- Same task commit containing this entry.

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
