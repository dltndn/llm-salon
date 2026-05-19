# Phase 4: LLM adapter and context builder

## Entry: 2026-05-19 Task 4.1

**Worker context:**
- Phase: Phase 4
- Task: Task 4.1: `LlmAdapter` interface and OpenAI adapter
- Dependencies reviewed:
  - Task 0.2
  - Phase 0 log
  - `docs/specs/07-llm-integration.md`
  - `docs/specs/08-security.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added the `LlmAdapter` contract, shared LLM input/output types, and adapter-specific domain errors.
- Added a thin OpenAI SDK adapter that reads `OPENAI_API_KEY` only inside `src/llm`, applies a 60 second timeout, disables SDK retries, and retries 5xx/network/timeout failures up to three times with exponential backoff.
- Added token usage return mapping and Nest logger output without database persistence.
- Added mock-first unit coverage for deterministic SDK response handling, missing API key, 5xx retry, timeout retry, 4xx no-retry, final failure, usage logging, and secret masking.
- Added a gated OpenAI E2E test that only runs when `LLM_SALON_E2E=1`.

**Why it matters for the next worker:**
- Phase 4 now has the provider abstraction that later context builder and report pipeline work can call.
- The OpenAI adapter owns raw API key access; service/controller code should not pass API keys around.
- The adapter retry policy is local and testable because OpenAI SDK retries are disabled.

**Dependency impact:**
- Satisfies Task 4.1 for Task 4.3 and later report pipeline tasks that need an LLM adapter.
- Introduces the `openai` npm dependency.
- Leaves Anthropic and Google adapters for future provider-specific tasks.

**Files touched:**
- `package.json`
- `pnpm-lock.yaml`
- `src/llm/llm-adapter.interface.ts`
- `src/llm/llm.errors.ts`
- `src/llm/llm.module.ts`
- `src/llm/openai.adapter.ts`
- `src/llm/__tests__/openai.adapter.spec.ts`

**Commit:**
- `25509be910fefb570de1f0c50b4d382100a5eb37`

**Verification completed:**
- [x] `./node_modules/.bin/jest src/llm/__tests__/openai.adapter.spec.ts`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint "src/llm/**/*.ts" src/app.module.ts`
- [x] Review subagent `gpt-5.4` reviewed Task 4.1, findings were addressed, and re-review reported no blocker.

**Not verified:**
- [ ] Real OpenAI E2E call with `LLM_SALON_E2E=1`, because this session did not have an E2E API key flow enabled.

**Open risks or follow-ups:**
- `LlmModule` is defined but not imported by the root app module yet; import it when a downstream service first consumes an adapter via DI.
- `ProviderCallFailedError` is not yet mapped to HTTP/SSE behavior; that belongs to downstream turn/report integration.

**Instructions for the next worker:**
- Read `docs/specs/07-llm-integration.md` before building Task 4.2 or Task 4.3.
- Preserve the rule that raw provider API keys are read only in `src/llm`.
- Keep default tests mocked; run real provider calls only behind `LLM_SALON_E2E=1`.
