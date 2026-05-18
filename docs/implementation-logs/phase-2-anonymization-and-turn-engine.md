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
