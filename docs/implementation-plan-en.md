# Implementation Plan: LLM-Salon MVP

> **Source of truth:** `docs/specs/` (00–10).
> Per AGENTS.md §9 (spec-first), all normative references in this plan use `docs/specs/` as the single authority.
> Exception: Phase 0–7 ordering follows `docs/initial-plannings/tech-spec.md` §16 (Implementation Phases) verbatim; the “Open questions” section is intentionally absent from specs, so tech-spec §17 is cited directly.

## Overview

This document decomposes the work to implement the decisions in `docs/specs/` as a single-process NestJS local discussion orchestrator. Order is data model → domain logic → SSR/SSE → LLM integration → MCP → report pipeline; each stage is a vertically integrated slice that can be validated independently.

## Architecture decisions

- **Single process / single user / 127.0.0.1 binding:** `00-overview.md` Key Invariants, `01-architecture.md` Process Model. Daemons, external exposure, and multi-user isolation are out of scope.
- **Multiple topics from MVP onward:** `00-overview.md` MVP Scope. PRD §5.2’s single-topic assumption is superseded by this decision.
- **Prisma + PostgreSQL ENUM mapping:** `04-database.md` General Policies, `02-domain-model.md` ENUMs.
- **Human / Anonymous serialization paths for all domain objects:** `02-domain-model.md` Anonymization Policy, `06-mcp.md` Anonymization Contract.
- **LLM system prompt fixed in English; only report output language varies via env:** `07-llm-integration.md` System Prompt / Report Output Language.
- **API keys only in `~/.llm-salon/.env`:** `08-security.md` API Key Principles. No shell rc auto-edits or DB storage.
- **CLI shares the same NestJS context (`nest-commander`):** `01-architecture.md` Technology Stack, `09-cli.md` Commands.
- **EventEmitter2 → SSE multiplexer:** `02-domain-model.md` Domain Events, `03-modules.md` `sse/`.
- **Turn consistency via transactions + row locks (`SELECT … FOR UPDATE`):** `02-domain-model.md` Concurrency Control.

---

## Execution Rules

- Read `docs/implementation-logs/README.md`.
- Follow dependency order strictly. Do not start downstream milestones before their prerequisites are verified.
- Prefer surgical changes inside the owning domain.
- Write or update tests before implementing or changing business logic.
- Before starting a task, read the relevant execution logs for the current phase and its dependency tasks.
- If previous execution logs contain still-valid constraints, deferred work, or dependency-sensitive findings, reflect them in the current task.
- After finishing a task and verifying it, create a commit for that task before moving on.
- After finishing a task, leave a handoff-oriented execution log under `docs/implementation-logs/` for the current phase.
- Every milestone must define:
  - test-first tasks
  - implementation tasks
  - verification tasks
- Do not start broad parallel work until file ownership boundaries are explicit.
- After each major milestone, run a review pass for correctness, regression risk, and missing coverage.

---

## Work breakdown

> Phase 0–7 split follows tech-spec §16 recommended order verbatim (specs intentionally omit phase ordering).

### Phase 0: Repository bootstrap and infrastructure

#### Task 0.1: pnpm workspace and NestJS scaffolding

**Description:** Create the NestJS 10 + Express adapter skeleton in a `pnpm` / Node 20 / TypeScript strict setup (`01-architecture.md` Technology Stack). `nest build` must produce a single `dist`.

**Acceptance criteria:**
- [ ] `package.json` defines AGENTS.md §11 commands (`start:dev`, `build`, `test`, `lint`, `typecheck`).
- [ ] `tsconfig.json` has strict mode enabled.
- [ ] `pnpm install && pnpm build` succeeds.
- [ ] `src/main.ts` binds to `127.0.0.1` (default port 4477) — `01-architecture.md` Port.

**Verification:**
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` succeeds.
- [ ] After `pnpm run start:dev`, `curl http://127.0.0.1:4477/health` returns 200.

**Dependencies:** None

**Files likely touched:**
- `package.json`, `tsconfig.json`, `nest-cli.json`
- `src/main.ts`, `src/app.module.ts`
- `src/http/health.controller.ts`

**Estimated scope:** S

#### Task 0.2: Config module and `LLM_SALON_HOME` boot guarantee

**Description:** Load `~/.llm-salon/.env` with `@nestjs/config`, implement directory creation, `.env.example` copy, and `LLM_SALON_HOME` override (`08-security.md` .env File, `01-architecture.md` User Data Directory).

**Acceptance criteria:**
- [ ] When `LLM_SALON_HOME` is unset, `~/.llm-salon/` is created automatically.
- [ ] When `.env` is missing, copy bundled `.env.example` and print guidance to stdout (`08-security.md` Lifecycle).
- [ ] OS environment variables override `.env` values.
- [ ] Whitelist validation for `LLM_SALON_PORT`, `LLM_SALON_CONTEXT_PROFILE`, `LLM_SALON_OUTPUT_LANGUAGE` (invalid values → default fallback + warning log) — `07-llm-integration.md` Fallback.

**Verification:**
- [ ] Unit test: invalid ENUM values → default fallback.
- [ ] Integration test: first boot in a temp directory creates `.env`.

**Dependencies:** 0.1

**Files likely touched:**
- `src/config/config.module.ts`, `src/config/env.schema.ts`
- `.env.example`
- `src/config/__tests__/env.schema.spec.ts`

**Estimated scope:** S

#### Task 0.3: PostgreSQL / Prisma bootstrap and automatic migrations

**Description:** Prisma 5 client, initial `prisma/schema.prisma` (empty models), boot-time `prisma migrate deploy` with `--auto-migrate` (default on) (`04-database.md` General Policies).

**Acceptance criteria:**
- [ ] `pnpm prisma generate` succeeds.
- [ ] `pnpm prisma migrate dev --name 0001_init` creates an empty migration.
- [ ] Boot can skip auto-migrate with `--no-auto-migrate` (`09-cli.md` Boot Flow step 5).
- [ ] Migration includes enabling `pgcrypto` extension (`04-database.md` General Policies).

**Verification:**
- [ ] Idempotent `pnpm prisma migrate deploy` against local PostgreSQL.

**Dependencies:** 0.1

**Files likely touched:**
- `prisma/schema.prisma`
- `prisma/migrations/0001_init/migration.sql`
- `src/prisma/prisma.module.ts`, `src/prisma/prisma.service.ts`

**Estimated scope:** S

### Checkpoint: Phase 0
- [ ] `pnpm typecheck && pnpm lint && pnpm build` all pass.
- [ ] Empty NestJS boots on 4477 with `/health` responding.
- [ ] `~/.llm-salon/.env` auto-created and Prisma connectivity verified.

---

### Phase 1: Data model and core CRUD

#### Task 1.1: Prisma schema — ENUMs and seven tables

**Description:** Implement schema/migrations for the nine ENUMs in `02-domain-model.md` ENUMs and tables `projects`, `topics`, `participants`, `documents`, `messages`, `turns`, `reports` from `04-database.md` Tables.

**Acceptance criteria:**
- [ ] All FKs use `ON DELETE CASCADE` (`04-database.md` General Policies).
- [ ] Include `participants` partial UNIQUE constraints (per `participant_type`) (`04-database.md` Additional constraints).
- [ ] Include all four index types from `04-database.md` Indexes.
- [ ] `messages.content` length ≤ 32KB CHECK constraint.

**Verification:**
- [ ] Apply migration to a fresh DB; `prisma db pull` shows no drift.
- [ ] Prisma unit test: error on anonymous-name UNIQUE violation.

**Dependencies:** 0.3

**Files likely touched:**
- `prisma/schema.prisma`
- `prisma/migrations/0002_domain_tables/migration.sql`

**Estimated scope:** M

#### Task 1.2: Project/Topic CRUD services and REST

**Description:** Implement `POST/GET /api/projects`, `POST /api/projects/:slug/topics` (`05-api.md` REST API). Include slug generation, uniqueness checks, and default phase.

**Acceptance criteria:**
- [ ] On project create: `status=created`, slug UNIQUE (`04-database.md` `projects`).
- [ ] On topic create: default `phase=preparing`, `mode=consensus` (`04-database.md` `topics`).
- [ ] DTO validation (`class-validator`): bad input → 400.

**Verification:**
- [ ] Supertest integration tests: CRUD round-trip (`10-testing.md` REST + SSE).

**Dependencies:** 1.1

**Files likely touched:**
- `src/projects/{projects.module,projects.service,projects.controller}.ts`
- `src/topics/{topics.module,topics.service,topics.controller}.ts`
- `test/projects.e2e-spec.ts`

**Estimated scope:** M

#### Task 1.3: Participant registration and anonymous names

**Description:** Participant registration endpoint (`05-api.md`) and transactional `Member A/B/…` assignment (`02-domain-model.md` Anonymous Name Assignment). Include `removed` in counts.

**Acceptance criteria:**
- [ ] Sequential assignment within a project with no anonymous-name collisions.
- [ ] Beyond 26 members, extend to `Member AA`.
- [ ] Duplicate `(client_name, model_name)` for `app` type → `DuplicateAppRegistrationError` (409) — `05-api.md` Error Handling.

**Verification:**
- [ ] Table-driven unit test: anonymous-name sequence for 1–30 registrations (`10-testing.md` Round-Robin Algorithm pattern applied).
- [ ] Integration test: two concurrent registrations get distinct names without race.

**Dependencies:** 1.2

**Files likely touched:**
- `src/participants/{participants.module,participants.service,participants.controller}.ts`
- `src/participants/__tests__/anonymous-name.spec.ts`

**Estimated scope:** M

#### Task 1.4: CLI `start` / `project list` / `env init`

**Description:** Implement CLI with `nest-commander` (`09-cli.md` Commands, Boot Flow). Include port auto-increment scan (max 10 attempts), lock file, and browser auto-launch.

**Acceptance criteria:**
- [ ] `llm-salon start <project>` creates/looks up project then boots server (`09-cli.md` Boot Flow).
- [ ] `~/.llm-salon/server.lock` records PID/port; duplicate boot blocked (`09-cli.md` Single-Instance Lock).
- [ ] `llm-salon project list` uses HTTP when server is up, otherwise one-shot boot.
- [ ] `llm-salon env init` only copies `.env.example` (`09-cli.md` Commands).

**Verification:**
- [ ] Manual local check: `start` → browser opens + URL printed to stdout (`09-cli.md` Boot Flow step 8).
- [ ] Second `start` while lock held exits with a clear error.

**Dependencies:** 1.2, 0.2

**Files likely touched:**
- `src/cli/{cli.module,start.command,project-list.command,env-init.command}.ts`
- `src/cli/server-lock.ts`

**Estimated scope:** M

### Checkpoint: Phase 1
- [ ] CLI can create project/topic/participants.
- [ ] DB assigns anonymous names consistently.
- [ ] `pnpm test` green.

---

### Phase 2: Anonymization infrastructure and turn engine

#### Task 2.1: Human/Anonymous DTOs and guards

**Description:** For every domain entity, build `*HumanDto` / `*AnonymousDto` pairs and enforce audience branching via response interceptor (`02-domain-model.md` Anonymization Policy, `03-modules.md` `common/`, `06-mcp.md` Anonymization Contract).

**Acceptance criteria:**
- [ ] Serialization chosen via `audience=human|anonymous` query or route metadata (`05-api.md` REST API).
- [ ] Throw if anonymous responses contain `display_name|provider_name|client_name|model_name` (`06-mcp.md` Anonymization Contract).
- [ ] Prompt builder type-forces `AnonymousDto` only (`03-modules.md` `prompt/`).

**Verification:**
- [ ] Unit tests (blacklist/whitelist both ways) — `10-testing.md` Anonymization Guard.
- [ ] e2e: snapshot REST `audience=anonymous` responses.

**Dependencies:** 1.3

**Files likely touched:**
- `src/common/dto/{human,anonymous}.ts`
- `src/common/interceptors/anonymous-guard.interceptor.ts`
- `src/common/__tests__/anonymous-guard.spec.ts`

**Estimated scope:** M

#### Task 2.2: Round-robin turn engine

**Description:** Implement `next participant` resolution, `turns` row updates, skip handling, and new-joiner joins-next-round per `02-domain-model.md` Round-Robin Turn Order.

**Acceptance criteria:**
- [ ] Sort by `join_order`; only active/pending are candidates.
- [ ] When crossing round boundary, `round_index += 1`.
- [ ] Inactive participants auto-skip + `turn.status='skipped'`.
- [ ] New participants mid-round enter candidate pool next round.

**Verification:**
- [ ] Table-driven unit tests (add/remove/rejoin scenarios) — `10-testing.md` Round-Robin Algorithm.

**Dependencies:** 1.3

**Files likely touched:**
- `src/turns/{turns.module,turn-engine.service}.ts`
- `src/turns/__tests__/turn-engine.spec.ts`

**Estimated scope:** M

#### Task 2.3: Message submit transaction and state machine

**Description:** Implement `POST /api/projects/:slug/topics/:topicId/messages` (`05-api.md`). `SELECT … FOR UPDATE` on `turns` → turn validation → message INSERT → next turn → phase auto-transition → domain events (`02-domain-model.md` Concurrency Control / Topic Phase State Machine / Domain Events).

**Acceptance criteria:**
- [ ] Calls without the turn → 409 `WrongTurnError` (`05-api.md` Error Handling).
- [ ] Auto `preparing → debating` on first message.
- [ ] Auto `debating → drafting` when `max_turns` or `max_rounds` reached.
- [ ] All changes in one transaction + emit events once after commit.

**Verification:**
- [ ] Regression: concurrent calls → one 409 (`10-testing.md` Regression Tests).
- [ ] Regression: exactly one SSE event per message.

**Dependencies:** 2.1, 2.2

**Files likely touched:**
- `src/messages/{messages.module,messages.service,messages.controller}.ts`
- `src/turns/topic-state-machine.service.ts`
- `src/events/domain-events.ts`
- `test/messages.e2e-spec.ts`

**Estimated scope:** M

### Checkpoint: Phase 2
- [ ] All anonymization guard unit tests pass.
- [ ] Round-robin / state-machine table tests green.
- [ ] e2e: message submit → next turn resolution.

---

### Phase 3: SSE and EJS dashboard

#### Task 3.1: Domain events → SSE multiplexer

**Description:** `EventEmitter2` subscription → per-project RxJS `Subject` → `/projects/:slug/events` SSE (`03-modules.md` `sse/`, `05-api.md` SSE Channel). On reconnect with `Last-Event-ID`, replay from recent 100-event queue.

**Acceptance criteria:**
- [ ] Event types match `05-api.md` Event Types table.
- [ ] Per-project queue cap 100 events.
- [ ] After reconnect, only events after `Last-Event-ID` are sent.

**Verification:**
- [ ] Supertest: receive SSE stream + reconnect scenario.

**Dependencies:** 2.3

**Files likely touched:**
- `src/sse/{sse.module,sse.controller,sse-broadcaster.service}.ts`
- `src/events/event-bus.ts`
- `test/sse.e2e-spec.ts`

**Estimated scope:** M

#### Task 3.2: EJS dashboard SSR + vanilla JS/CSS

**Description:** Render `GET /` (project list) and `GET /projects/:slug` (dashboard) with EJS (`05-api.md` Page Routes / EJS Page Layout). Include topic selector (`?topic=`), participant panel, message area, SSE client script.

**Acceptance criteria:**
- [ ] EJS uses Human DTO so `display_name` shows.
- [ ] Vanilla JS: SSE subscribe + DOM append + auto-scroll.
- [ ] No pagination or dark mode (`05-api.md` Responsive Scope, out of scope).

**Verification:**
- [ ] Manual check: message submit reflects immediately in another tab.

**Dependencies:** 3.1, 1.4

**Files likely touched:**
- `src/http/views/{layout,projects-index,project-dashboard}.ejs`
- `public/{styles.css,dashboard.js}`
- `src/http/views.controller.ts`

**Estimated scope:** M

### Checkpoint: Phase 3
- [ ] Browser auto-launch → dashboard renders → messages update via SSE.
- [ ] `pnpm test` green; regression (1 message = 1 event) holds.

---

### Phase 4: LLM adapter and context builder

#### Task 4.1: `LlmAdapter` interface and OpenAI adapter

**Description:** Define `07-llm-integration.md` LLM Adapter Interface + OpenAI thin wrapper. Timeout 60s; exponential backoff on 5xx up to 3 retries (`07-llm-integration.md` Call Policy). API keys only from `process.env` inside adapter (`08-security.md` API Key Principles).

**Acceptance criteria:**
- [ ] OpenAI SDK calls return deterministic responses under mock (normal tests) — `10-testing.md` LLM Adapter Tests.
- [ ] On 5xx, retry up to 3 times; beyond that `ProviderCallFailedError`.
- [ ] Missing API key → `MissingApiKeyError`.

**Verification:**
- [ ] Unit tests: retry/timeout/masking.
- [ ] With `LLM_SALON_E2E=1`, one real call passes.

**Dependencies:** 0.2

**Files likely touched:**
- `src/llm/{llm.module,llm-adapter.interface,openai.adapter}.ts`
- `src/llm/__tests__/openai.adapter.spec.ts`

**Estimated scope:** M

#### Task 4.2: Model metadata and context policy

**Description:** Hardcode per-model window / recommended output tokens in `llm/models.ts` (`07-llm-integration.md` Per-Model Token Metadata). Single source of truth for Context Length Policy table in `llm/context-policy.ts`.

**Acceptance criteria:**
- [ ] Expose per-profile token caps, document caps, message retention ratios.
- [ ] Reuse env fallback/masking from 0.2 module.

**Verification:**
- [ ] Unit tests: per-profile upper-bound math (`10-testing.md` Context Profile Policy).

**Dependencies:** 0.2

**Files likely touched:**
- `src/llm/{models,context-policy}.ts`
- `src/llm/__tests__/context-policy.spec.ts`

**Estimated scope:** S

#### Task 4.3: Anthropic and Google adapters + model metadata expansion

**Description:** Implement the remaining `07-llm-integration.md` Supported Providers (`anthropic` → `AnthropicAdapter`, `google` → `GoogleAdapter`) as thin wrappers around their official SDKs (`@anthropic-ai/sdk`, `@google/generative-ai`), conforming to the `LlmAdapter` interface from 4.1. Apply the same Call Policy as 4.1 (60s timeout, exponential backoff up to 3 retries on 5xx/network errors, no retry on 4xx). API keys are read only inside the adapter from `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` (`08-security.md` API Key Principles). Register both in the `LlmModule` provider registry so they can be looked up by `providerName`. Extend `llm/models.ts` (from 4.2) with token windows and recommended output tokens for each provider's representative models.

**Acceptance criteria:**
- [ ] `AnthropicAdapter` / `GoogleAdapter` satisfy the `LlmAdapter` interface; `providerName` is `anthropic` / `google` respectively.
- [ ] Both adapters return deterministic responses under SDK mocks (`10-testing.md` LLM Adapter Tests).
- [ ] Up to 3 retries on 5xx / network errors; beyond that `ProviderCallFailedError`. 4xx fails immediately.
- [ ] Missing API key per adapter → `MissingApiKeyError` (compatible with `08-security.md` Boot-Time Provider Validation).
- [ ] Provider registry resolves an adapter instance by string key (`openai` / `anthropic` / `google`).
- [ ] `llm/models.ts` includes Anthropic and Google representative models with window/output metadata; 4.2 profile math continues to work.

**Verification:**
- [ ] Unit tests: retry/timeout/key masking for both adapters.
- [ ] Unit tests: provider registry lookup and `providerName` mapping.
- [ ] Unit tests: per-profile upper-bound math for newly added models.
- [ ] With `LLM_SALON_E2E=1`, one real call per provider passes when keys are available.

**Dependencies:** 4.1, 4.2

**Files likely touched:**
- `src/llm/{anthropic.adapter,google.adapter}.ts`
- `src/llm/llm.module.ts` (provider registry update)
- `src/llm/models.ts` (Anthropic / Google model metadata)
- `src/llm/__tests__/{anthropic.adapter,google.adapter,provider-registry}.spec.ts`

**Estimated scope:** M

#### Task 4.4: Context builder + anonymization

**Description:** Build LLM input per `07-llm-integration.md` Context Builder eight-step structure. Include system state block (step 2) and System Prompt (English fixed). Only `AnonymousDto` allowed. When message retention exceeds limits, prefer summary per Previous Message Overflow; on failure, sliding window. Summary call is owned by the **first participant** (minimum `join_order`, excluding `removed`): synchronous call only when type is `provider`; if `app`, immediately fall back to sliding window. Summary system prompt lives in `prompt/summary-prompt.ts` as single source of truth.

**Acceptance criteria:**
- [ ] Throw if builder output matches human-identifier regex.
- [ ] System prompt fixed in English.
- [ ] Oversized document registration → `DocumentTooLargeError` (`07-llm-integration.md` Document Size Rejection / `05-api.md` Error Handling).
- [ ] Summary call only when first participant is `provider`; sliding window fallback for `app`.
- [ ] Summary call frequency ≤ once per `N = max(2, max_rounds // 4)` rounds per topic.

**Verification:**
- [ ] Unit test: no human-identifier leakage.
- [ ] Unit test: on summary failure, sliding window fallback + placeholder insertion.
- [ ] Unit test: summary path branches on first participant type (`provider` / `app`).

**Dependencies:** 4.1, 4.2, 4.3, 2.1

**Files likely touched:**
- `src/prompt/{context-builder.service,system-prompt,summary-prompt,summarizer.service}.ts`
- `src/prompt/__tests__/*.spec.ts`

**Estimated scope:** M

#### Task 4.5: Provider participant registration and auto-speak

**Description:** Provider branch on `POST /api/projects/:slug/participants` + `llm-salon provider add` CLI (`09-cli.md` Commands). When it is their turn: context builder → adapter → delegate to message submit transaction (2.3).

**Acceptance criteria:**
- [ ] On provider register, missing key in `.env` → immediate `MissingApiKeyError` (`08-security.md` Boot-Time Provider Validation).
- [ ] Auto-speak uses the normal message path (2.3).
- [ ] On call failure, mark turn `skipped` + SSE notice (`07-llm-integration.md` Call Policy).

**Verification:**
- [ ] e2e with mock adapter: two providers speak in round-robin.

**Dependencies:** 4.4, 3.1

**Files likely touched:**
- `src/participants/provider-participant.service.ts`
- `src/cli/provider-add.command.ts`
- `src/turns/auto-speak.service.ts`
- `test/auto-speak.e2e-spec.ts`

**Estimated scope:** M

### Checkpoint: Phase 4
- [ ] OpenAI mock auto-speak completes one full round.
- [ ] Anonymization guard regressions green.
- [ ] With `LLM_SALON_E2E=1`, verify one real key call when available.

---

### Phase 5: MCP / stdio interface

#### Task 5.1: MCP stdio server and HTTP delegation

**Description:** `llm-salon mcp` uses `@modelcontextprotocol/sdk` stdio transport (`06-mcp.md` Transport, `09-cli.md` Commands). All tools delegate to internal HTTP API.

**Acceptance criteria:**
- [ ] Clear error when server is not running.
- [ ] JSON-RPC round-trip works.

**Verification:**
- [ ] Integration test spawning child: `get_server_status` round-trip (`10-testing.md` MCP).

**Dependencies:** 4.5

**Files likely touched:**
- `src/mcp/{mcp.module,stdio-server.ts,http-bridge.ts}`
- `src/cli/mcp.command.ts`
- `test/mcp.e2e-spec.ts`

**Estimated scope:** M

#### Task 5.2: MCP tools + anonymization guard

**Description:** Implement tools from `06-mcp.md` Tools (`create_project`, `get_server_status`, `get_project_status`, `join_project`, `create_topic`, `add_document`, `get_context`, `get_turn`, `is_my_turn`, `submit_message`, `get_report_status`). Attach `serverTime` / `topicVersion` for volatile responses (`06-mcp.md` Response Staleness Detection).

**Acceptance criteria:**
- [ ] Response payloads never include human identifiers (guard passes) — `06-mcp.md` Anonymization Contract.
- [ ] `submit_message` wrong turn → `WRONG_TURN` + current turn’s anonymous name (`06-mcp.md` Debate Tools).
- [ ] `add_document` allows inline text body only; reject binary/file paths.

**Verification:**
- [ ] Per-tool unit tests.
- [ ] e2e: `is_my_turn` true only for holder (`10-testing.md` Regression Tests).

**Dependencies:** 5.1, 2.1

**Files likely touched:**
- `src/mcp/tools/*.ts`
- `src/mcp/errors.ts`
- `src/mcp/__tests__/*.spec.ts`

**Estimated scope:** L

### Checkpoint: Phase 5
- [ ] LLM app completes join → context → submit via MCP (scripted).
- [ ] Anonymization guard regressions still pass.

---

### Phase 6: Report pipeline

#### Task 6.1: Reporter selection + drafting entry

**Description:** On auto `debating → drafting` (`02-domain-model.md` Topic Phase State Machine), set `reporter_participant_id` (MVP: minimum `join_order` among active providers) and queue draft creation.

**Acceptance criteria:**
- [ ] `topics.reporter_participant_id` populated (`04-database.md` `topics`).
- [ ] `report.status=drafting`; domain event emitted (`02-domain-model.md` Domain Events).

**Verification:**
- [ ] e2e: `max_turns` reached → drafting + reporter assigned.

**Dependencies:** 4.5

**Files likely touched:**
- `src/reports/{reports.module,reports.service,reporter-selector.ts}`
- `test/reports-drafting.e2e-spec.ts`

**Estimated scope:** S

#### Task 6.2: Draft / feedback / final report LLM calls

**Description:** System prompt variants for drafting/reviewing/finalizing. For reporter model calls only, append one line per `07-llm-integration.md` Report Output Language. Map `LLM_SALON_OUTPUT_LANGUAGE` via `llm/output-languages.ts`.

**Acceptance criteria:**
- [ ] Auto `reviewing → finalizing` when all active participants submitted feedback once (`02-domain-model.md` Topic Phase State Machine).
- [ ] Auto `finalizing → finalized` when final file write completes.
- [ ] Invalid `LLM_SALON_OUTPUT_LANGUAGE` → `en` fallback + warning log (`07-llm-integration.md` Fallback).

**Verification:**
- [ ] Unit tests: system prompt snapshots per stage.
- [ ] e2e: one topic reaches `finalized` with mock LLM.

**Dependencies:** 6.1, 4.4

**Files likely touched:**
- `src/reports/report-pipeline.service.ts`
- `src/llm/output-languages.ts`
- `src/prompt/report-prompts.ts`
- `test/report-pipeline.e2e-spec.ts`

**Estimated scope:** L

#### Task 6.3: Report file storage and path guard

**Description:** Save final Markdown under `LLM_SALON_HOME/projects/<slug>/reports/` (`01-architecture.md` User Data Directory). `path.resolve` + base prefix check (`08-security.md` File System Boundaries). Update `reports.file_path`.

**Acceptance criteria:**
- [ ] Block traversal (`../`) outside base path.
- [ ] Avoid filename collisions on re-run for same topic (timestamp suffix).

**Verification:**
- [ ] Unit test: reject traversal inputs.

**Dependencies:** 6.2

**Files likely touched:**
- `src/storage/local-storage.service.ts`
- `src/storage/__tests__/local-storage.spec.ts`

**Estimated scope:** S

### Checkpoint: Phase 6
- [ ] One topic runs `preparing → finalized` end-to-end with mock LLM.
- [ ] Report file on disk matches DB `reports.file_path`.

---

### Phase 7: Documentation and wrap-up

#### Task 7.1: English README + user guide

**Description:** English README covering install/boot/`.env` setup/`provider add`/MCP registration prompt (`06-mcp.md` LLM App Registration). State single-user / 127.0.0.1 / no external exposure explicitly.

**Acceptance criteria:**
- [ ] README states constraints from `00-overview.md` Key Invariants, `05-api.md` Authentication, `08-security.md` API Key Principles.
- [ ] Recommend `chmod 600 ~/.llm-salon/.env` (`08-security.md`).

**Verification:**
- [ ] Self-check: new user can go from README-only to `start` → first topic message.

**Dependencies:** 6.3

**Files likely touched:**
- `README.md`
- `docs/user-guide.md`

**Estimated scope:** S

#### Task 7.2: Logging masking and error mapping audit

**Description:** Audit masking interceptor per `08-security.md` API Key Principles; domain errors → HTTP/MCP mapping table per `05-api.md` Error Handling.

**Acceptance criteria:**
- [ ] Every domain error maps 1:1 to HTTP 4xx/5xx and MCP error codes (`05-api.md` Error Handling, `06-mcp.md` usage).
- [ ] API key patterns never appear in logs/SSE payloads (tests enforce).

**Verification:**
- [ ] Unit tests: masking interceptor I/O.
- [ ] Regression: mapping table for all domain error cases.

**Dependencies:** 5.2, 6.3

**Files likely touched:**
- `src/security/masking.interceptor.ts`
- `src/common/exception-filter.ts`
- `src/mcp/errors.ts`

**Estimated scope:** S

### Checkpoint: Complete
- [ ] All tech-spec §16 Phase 0–7 deliverables met.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass.
- [ ] Manual e2e for one topic (boot → participants → speak → drafting → finalized).
- [ ] Merge after human review.

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Turn concurrency bug → duplicate speech | High | `SELECT … FOR UPDATE` + regression (concurrent → 409) — `02-domain-model.md` Concurrency Control / `10-testing.md` Regression Tests / Task 2.3 |
| Anonymization leak (human IDs in LLM/MCP responses) | High | Whitelist interceptor + regex checks + bidirectional unit tests — `02-domain-model.md` Anonymization Policy / `06-mcp.md` Anonymization Contract / Tasks 2.1, 4.4, 5.2 |
| Context length exceeded → LLM call fails | Med | Profile caps + summary step + sliding window fallback — `07-llm-integration.md` Context Length Policy / Tasks 4.2, 4.4 |
| Missing/typo `.env` → failure only on first call after boot | Med | Validate env at boot, cache in memory + clear guidance on `provider add` failure — `08-security.md` Boot-Time Provider Validation / Tasks 0.2, 4.5 |
| Prisma migration mistakes → missing ENUM/constraints | Med | `prisma db pull` diff check in 1.1 + CI typecheck |
| MCP child waits forever when server down | Low | Clear error + timeout in 5.1 — `06-mcp.md` Transport |
| Browser auto-launch fails on multi-OS/shell | Low | Also print URL to stdout — `09-cli.md` Boot Flow step 8 / Task 1.4 |

---

## Open questions

> Specs carry decisions only; unresolved items cite tech-spec §17 directly.

- **Context profile ratio table / inline document limits:** apply provisional values, revisit with real usage data (tech-spec §17.1).
- ~~**Model/prompt for context summarization**~~ → Resolved: first participant (minimum `join_order`, excluding `removed`) owns it; synchronous call only for `provider`; sliding window fallback for `app`. Prompt fixed in `prompt/summary-prompt.ts` (`07-llm-integration.md` Previous Message Overflow).
- **Moderator LLM, permission model, external exposure tokens/TLS:** out of scope for MVP; follow-up spec (tech-spec §17.2).

## Parallelization guide

- **Phase 0 tasks 0.1 / 0.2 / 0.3:** After 0.1, 0.2 and 0.3 can run in parallel.
- **Phase 1 tasks 1.2 / 1.3:** Parallel after schema (1.1) is fixed.
- **Phase 4 tasks 4.1 / 4.2:** Parallel after interface agreement; 4.3 adds the remaining provider adapters and 4.4 merges them into the context builder.
- **Phase 4 task 4.3:** Anthropic and Google adapter work can run in parallel once 4.1's interface and 4.2's model metadata are settled.
- **Phase 5 / 6:** 5.1 and 6.1 can start together after Phase 4. However, 6.2 shares anonymization guard with 4.4 and 5.2—align those first.
- **Must be sequential:** Prisma migrations (1.1), turn transaction (2.3), report state machine (6.1 → 6.2 → 6.3).
