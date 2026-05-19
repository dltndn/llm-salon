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

## Entry: 2026-05-19 Task 4.2

**Worker context:**
- Phase: Phase 4
- Task: Task 4.2: Model metadata and context policy
- Dependencies reviewed:
  - Task 0.2
  - Task 4.1
  - Phase 0 log
  - Phase 4 Task 4.1 log
  - `docs/specs/07-llm-integration.md`
  - `docs/specs/08-security.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added hardcoded model metadata in `src/llm/models.ts` for OpenAI text models currently used by the project path (`gpt-4o`, `gpt-4o-mini`, `gpt-4`).
- Added conservative token estimation helper using the spec fallback of roughly 4 characters per token.
- Added `src/llm/context-policy.ts` as the source of truth for profile ratios, document inline caps, previous message retention ratios, and calculated token budgets.
- Exported `normalizeContextProfile()` from `src/config/env.schema.ts` and reused it in context policy resolution so profile fallback stays aligned with Task 0.2 env normalization.
- Added unit tests for per-profile document caps, retention ratios, token cap math, invalid/missing env fallback, and the `gpt-4` regression where output tokens must not collapse the input context budget.

**Why it matters for the next worker:**
- Task 4.3 can use `calculateContextTokenBudget()` and `getContextProfilePolicy()` instead of duplicating profile math.
- Attached-document upload limits should use `CONTEXT_PROFILE_POLICIES` to preserve the spec's single source of truth.
- Model output metadata is intentionally separate from the input context cap; do not subtract output tokens from `maxInputTokens`.

**Dependency impact:**
- Satisfies Task 4.2 for Task 4.3 context builder work.
- Extends the Task 0.2 env module with a reusable context-profile normalizer.
- Does not add new npm dependencies.

**Files touched:**
- `src/config/env.schema.ts`
- `src/llm/models.ts`
- `src/llm/context-policy.ts`
- `src/llm/__tests__/context-policy.spec.ts`

**Commit:**
- `7a1968a70ed2c8cfc5f93d41ef6ff9e678500bba`

**Verification completed:**
- [x] `./node_modules/.bin/jest src/llm/__tests__/context-policy.spec.ts`
- [x] `./node_modules/.bin/jest src/llm`
- [x] `./node_modules/.bin/jest src/llm/__tests__/context-policy.spec.ts src/config/__tests__/env.schema.spec.ts`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint "src/llm/**/*.ts"`
- [x] `./node_modules/.bin/eslint "src/llm/**/*.ts" src/config/env.schema.ts src/config/__tests__/env.schema.spec.ts`
- [x] Review subagent `gpt-5.4` reviewed Task 4.2, findings were addressed, and re-review reported no blocker.

**Not verified:**
- [ ] Full repository test suite, because Task 4.2 only changes LLM policy math and env profile normalization.

**Open risks or follow-ups:**
- Model metadata is intentionally not exhaustive; add provider/model entries as Anthropic and Google adapters are implemented.
- `resolveContextProfile()` now shares the env warning path, so repeated calls with an invalid raw env value can emit repeated warnings until boot-time normalization has corrected `process.env`.

**Instructions for the next worker:**
- For Task 4.3, import context limits from `src/llm/context-policy.ts`; do not copy the table into prompt code.
- Use `maxInputTokens` as the profile-derived input context cap and keep `recommendedMaxOutputTokens` as separate output guidance.
- If new provider models are accepted from registration, add their metadata to `src/llm/models.ts` or define explicit unknown-model handling before using the context builder.

## Follow-up: 2026-05-19 Task 4.2 model metadata update

**Worker context:**
- Phase: Phase 4
- Task: Task 4.2 follow-up: add requested OpenAI GPT 5 model metadata
- Dependencies reviewed:
  - Task 4.2
  - Phase 4 Task 4.2 log
  - `docs/specs/07-llm-integration.md`
  - Official OpenAI model docs for GPT-5.5, GPT-5.4, and GPT-5.4 mini

**What was done:**
- Added OpenAI model metadata for `gpt-5.5`, `gpt-5.4`, and `gpt-5.4-mini`.
- Added context policy tests that assert the new model metadata values.

**Why it matters for the next worker:**
- Provider registration or context builder code can now resolve metadata for the requested GPT 5 model IDs.
- The API model IDs are hyphenated (`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`), not space-separated labels.

**Dependency impact:**
- Extends Task 4.2 metadata coverage without changing context policy math.

**Files touched:**
- `src/llm/models.ts`
- `src/llm/__tests__/context-policy.spec.ts`

**Commit:**
- `95e179c7ce67ae2ca259f2623953b831b3be7905`

**Verification completed:**
- [x] `./node_modules/.bin/jest src/llm/__tests__/context-policy.spec.ts`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint "src/llm/**/*.ts"`

**Not verified:**
- [ ] Real provider calls with the new models.

**Open risks or follow-ups:**
- Confirm account/project access to these model IDs before using them in E2E provider tests.

**Instructions for the next worker:**
- Use `getModelMetadata()` for these IDs instead of hardcoding windows in downstream code.
