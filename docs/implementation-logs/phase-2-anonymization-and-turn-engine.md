# Phase 2: Anonymization infrastructure and turn engine

## Entry: 2026-05-18 Task 2.1

**Worker context:**
- Phase: Phase 2
- Task: Task 2.1: Human/Anonymous DTOs and guards
- Dependencies reviewed:
  - Task 1.4
  - Phase 1 log
  - `docs/specs/02-domain-model.md`
  - `docs/specs/03-modules.md`
  - `docs/specs/05-api.md`
  - `docs/specs/06-mcp.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added shared human and anonymous DTO contracts for the current domain entities.
- Added request audience resolution via query parameter or route metadata.
- Added a global anonymous response guard interceptor with forbidden-key and allowed-key validation.
- Added anonymous-safe conflict error messages for anonymous requests.
- Added prompt input typing that accepts only anonymous DTOs and performs a second string-pattern guard for known human/model identifiers.
- Updated current project/topic/participant routes and presenters to use the shared audience path.
- Added unit and REST coverage for anonymous guard behavior, prompt input guarding, anonymous snapshots, and anonymous conflict errors.

**Why it matters for the next worker:**
- Phase 2 downstream MCP and LLM-facing work can rely on `request.audience` and the anonymous response guard being applied globally through `applyHttpGlobals()`.
- Anonymous error responses intentionally use a generic conflict message to avoid leaking app/model/provider names from domain errors.
- The prompt identifier regex is finite by design and should be extended when new provider/model families are added.

**Dependency impact:**
- Satisfies Task 2.1 and unblocks Task 2.2 round-robin work.
- Establishes the common DTO and anonymous guard surface that later MCP, SSE, message, turn, report, and prompt code should reuse.

**Files touched:**
- `src/common/audience.ts`
- `src/common/dto/*`
- `src/common/interceptors/anonymous-guard.interceptor.ts`
- `src/common/errors/domain-exception.filter.ts`
- `src/prompt/prompt-input.ts`
- `src/projects/*`
- `src/topics/*`
- `src/participants/*`
- `test/projects.spec.ts`
- `test/participants.spec.ts`

**Commit:**
- `90cc0d9357ced45c39c8d71113929b67127b1252`

**Verification completed:**
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/jest src/common/__tests__/anonymous-guard.spec.ts src/prompt/prompt-input.spec.ts --runInBand`
- [x] `./node_modules/.bin/jest test/projects.spec.ts test/participants.spec.ts --runInBand` with elevated permission for Supertest listener binding
- [x] `./node_modules/.bin/eslint src/common src/prompt src/projects src/participants src/topics src/http test/projects.spec.ts test/participants.spec.ts`
- [x] `./node_modules/.bin/nest build`
- [x] `git diff --check`
- [x] Subagent review completed; findings were addressed and re-review approved.

**Not verified:**
- [ ] Literal `pnpm` commands, because `pnpm` is not available on this shell PATH.
- [ ] Opt-in DB-backed REST tests, because Task 2.1 changed serialization/guarding and did not require schema or transaction validation.

**Open risks or follow-ups:**
- The prompt human-identifier regex should be updated as supported provider/model names expand.
- Later MCP/SSE payload serializers should reuse the common DTO contracts and anonymous guard instead of adding ad hoc filtering.

**Instructions for the next worker:**
- For Task 2.2, preserve the global anonymous guard and use anonymous DTOs for any turn/context payload exposed to LLM-facing paths.
- If adding new anonymous response keys, update the guard allowlist and add a focused test.
- Keep anonymous conflict/error messages free of app, provider, client, and model identifiers.

## Entry: 2026-05-18 Task 2.2

**Worker context:**
- Phase: Phase 2
- Task: Task 2.2: Round-robin turn engine
- Dependencies reviewed:
  - Task 1.3
  - Task 1.4
  - Task 2.1
  - Phase 1 log
  - Phase 2 log
  - `docs/specs/02-domain-model.md`
  - `docs/specs/03-modules.md`
  - `docs/specs/04-database.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added `turns/` module and exported `TurnEngineService`.
- Added a pure round-robin resolver that sorts by `joinOrder`, chooses active/waiting participants, records inactive/removed entries as skipped turns, increments `roundIndex` on wrap, and defers mid-round joins until the next round.
- Added service-level advancement that locks the current turn in the public path, completes the current turn, creates skipped and next `in_progress` turn rows, and updates the topic pointer.
- Added table-driven resolver tests and service tests for row updates and topic pointer updates.

**Why it matters for the next worker:**
- Task 2.3 can call `TurnEngineService.advanceFromCurrentTurn()` inside the message submission transaction after locking/validating the current turn.
- The public `advanceFromTurn()` method performs `SELECT ... FOR UPDATE`; callers that already hold a transaction lock should use `advanceFromCurrentTurn()`.
- Mid-round join eligibility is based on `participants.joinedAt` compared with the first turn's `createdAt` for the current round.

**Dependency impact:**
- Satisfies Task 2.2 and unblocks Task 2.3 message submission transaction work.
- Introduces the `turns/` module as a dependency available from `AppModule`.

**Files touched:**
- `src/app.module.ts`
- `src/turns/turn-engine.ts`
- `src/turns/turn-engine.service.ts`
- `src/turns/turns.module.ts`
- `src/turns/__tests__/turn-engine.spec.ts`
- `src/turns/__tests__/turn-engine.service.spec.ts`

**Commit:**
- `2febe52bc3163f1a2155d7217ce6c52420f3dec7`

**Verification completed:**
- [x] `./node_modules/.bin/jest src/turns/__tests__/turn-engine.spec.ts src/turns/__tests__/turn-engine.service.spec.ts --runInBand`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint src/app.module.ts src/turns`
- [x] `./node_modules/.bin/nest build`
- [x] `git diff --check`
- [x] Subagent review completed; findings were addressed and re-review approved.

**Not verified:**
- [ ] Literal `pnpm` commands, because `pnpm` is not available on this shell PATH.
- [ ] PostgreSQL integration lock behavior, because Task 2.2 was verified with unit/mock service tests; Task 2.3 should add transaction/concurrency integration coverage.

**Open risks or follow-ups:**
- Row-lock coverage is mock-level only; Task 2.3 should verify real transaction behavior when message submission and turn advancement are wired together.
- The current implementation does not change participant `waiting` to `active` when selected; no spec acceptance criterion requires that yet.

**Instructions for the next worker:**
- In Task 2.3, lock and validate the current turn before calling `advanceFromCurrentTurn()`.
- Preserve the round-start timestamp rule for late joins unless a schema-level round membership snapshot is introduced.
- Add integration coverage for concurrent submit behavior once message submission uses this engine.

## Entry: 2026-05-18 Task 2.3

**Worker context:**
- Phase: Phase 2
- Task: Task 2.3: Message submit transaction and state machine
- Dependencies reviewed:
  - Task 2.1
  - Task 2.2
  - Phase 2 log
  - `docs/specs/02-domain-model.md`
  - `docs/specs/03-modules.md`
  - `docs/specs/05-api.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added `POST /api/projects/:slug/topics/:topicId/messages`.
- Added message submission validation with current-turn locking and `WrongTurnError` mapping to 409.
- Inserted messages and turn advancement in one Prisma transaction.
- Added automatic `preparing -> debating` and `debating -> drafting` transitions for `maxTurns` and completed `maxRounds`.
- Added a domain event bus and emitted `message.created`, `turn.changed`, and `topic.phase_changed` only after the transaction commits.
- Added REST regression tests for message submit, wrong/no turn, phase transitions, concurrent submit behavior, and exactly one `message.created` event.
- Added opt-in Prisma-backed concurrency coverage gated by `DATABASE_URL` and `LLM_SALON_RUN_DB_TESTS=1`.

**Why it matters for the next worker:**
- Phase 3 can subscribe to the domain event bus to implement SSE fan-out.
- The message route assumes an `in_progress` turn already exists; no implicit initial-turn creation was added because Task 2.3 requires calls without a turn to return 409.
- Actual SSE delivery is still Phase 3 scope; Phase 2 verifies domain event emission.

**Dependency impact:**
- Satisfies Task 2.3 and completes the Phase 2 checkpoint at the domain-event level.
- Unblocks Phase 3 SSE and dashboard work.

**Files touched:**
- `src/app.module.ts`
- `src/common/errors/*`
- `src/events/*`
- `src/messages/*`
- `test/messages.spec.ts`

**Commit:**
- `a081fd8cbb7144e3273e64563c9b3037b3259551`

**Verification completed:**
- [x] `./node_modules/.bin/jest test/messages.spec.ts --runInBand` with elevated permission for Supertest listener binding
- [x] `./node_modules/.bin/jest src/common/__tests__/anonymous-guard.spec.ts src/prompt/prompt-input.spec.ts src/turns/__tests__/turn-engine.spec.ts src/turns/__tests__/turn-engine.service.spec.ts --runInBand`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint src/app.module.ts src/messages src/events src/common/errors src/turns test/messages.spec.ts`
- [x] `./node_modules/.bin/nest build`
- [x] `git diff --check`
- [x] `gpt-5.4` subagent review completed; findings were addressed and re-review approved.

**Not verified:**
- [ ] Literal `pnpm` commands, because `pnpm` is not available on this shell PATH.
- [ ] Opt-in Prisma-backed concurrency test, because `DATABASE_URL` is not set in this shell.
- [ ] Actual SSE fan-out, because `sse/` is Phase 3 scope and is not implemented yet.

**Open risks or follow-ups:**
- Enable the DB-backed test lane with `DATABASE_URL` and `LLM_SALON_RUN_DB_TESTS=1` in CI or local database verification.
- Phase 3 must connect `DomainEventBus` to SSE and verify exactly one SSE event per message.

**Instructions for the next worker:**
- Start Phase 3 from the `DomainEventBus` events added in Task 2.3.
- Do not add a second message event path when implementing SSE; subscribe to `message.created` instead.
- If an initial-turn creation flow is added, keep the current no-turn 409 behavior for submit calls that lack an active turn.

## Phase 2 checkpoint status
- [x] All anonymization guard unit tests pass.
- [x] Round-robin / state-machine table tests pass.
- [x] e2e-style REST message submit resolves the next turn.
- [ ] Actual SSE delivery is deferred to Phase 3, where the SSE module is introduced.
