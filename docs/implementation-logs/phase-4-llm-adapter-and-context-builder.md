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

## Follow-up: 2026-05-19 Plan document update — add Anthropic / Google adapter tasks to Phase 4

**Worker context:**
- Phase: Phase 4 (plan documents only; no code changes)
- Task: Correct plan omission — `AnthropicAdapter` / `GoogleAdapter` work listed in `docs/specs/07-llm-integration.md` Supported Providers was missing from Phase 4 in `docs/implementation-plan.md` and `docs/implementation-plan-en.md`.
- Dependencies reviewed:
  - Phase 4 Task 4.1 / 4.2 log
  - `docs/specs/07-llm-integration.md`
  - `docs/specs/08-security.md`
  - `docs/implementation-plan.md` / `docs/implementation-plan-en.md` Phase 4

**What was done:**
- Inserted new `Task 4.3: Anthropic and Google adapters + model metadata expansion` into Phase 4 of both plan documents, between Task 4.2 and the former context-builder task. Acceptance criteria reference the same Call Policy as 4.1 (60s timeout, up to 3 retries on 5xx/network with exponential backoff, immediate failure on 4xx) and API Key Principles (`ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` read only inside adapters). Also covers `LlmModule` provider-registry routing by `providerName` and extending 4.2 `llm/models.ts` with representative Anthropic / Google model metadata.
- Renumbered former Task 4.3 (context builder + anonymization) → **4.4**, former Task 4.4 (provider participant registration and auto-speak) → **4.5**.
- Updated dependencies: new 4.4 deps include `4.3`; 4.5 deps `4.3 → 4.4`; Phase 5 Task 5.1 and Phase 6 Task 6.1 deps `4.4 → 4.5`; Phase 6 Task 6.2 deps `4.3 → 4.4`.
- Synced task numbers in the risk table (anonymization leak / context length / missing `.env`) and Suggested Parallelization section. Added one line for 4.3 parallelization (“Anthropic and Google adapter work can run in parallel once 4.1’s interface and 4.2’s model metadata are settled”).

**Why it matters for the next worker:**
- Implement Anthropic / Google adapters in new Task 4.3 before starting the context builder (now Task 4.4). Because 4.4 depends on 4.3, the provider-registry interface becomes the single entry point for adapter lookup on the builder call path.
- Provider registration (now Task 4.5) and later MCP / report phases have deps updated to the new numbering; re-read the plan and watch for renumbered tasks.
- The Task 4.2 follow-up already noted expanding model metadata when Anthropic / Google adapters are added; this plan update formalizes that follow-up as an explicit plan task.

**Dependency impact:**
- No code or schema changes; only task numbers and the dependency graph in plan documents changed.
- Phase 4 progress remains complete through 4.2. New Task 4.3 is the next item for the following worker.

**Files touched:**
- `docs/implementation-plan.md`
- `docs/implementation-plan-en.md`

**Commit:**
- (Not committed — per user request, plan updates only)

**Verification completed:**
- [x] `grep` confirmed Phase 4 task numbers and all `Dependencies:` lines in both plan documents are consistent with the new 4.3 / 4.4 / 4.5 scheme.
- [x] Risk table and Suggested Parallelization section numbers match the body task numbers.

**Not verified:**
- [ ] jest / tsc / eslint not run, because there were no code changes.

**Open risks or follow-ups:**
- Phrases in earlier log entries such as “Read `docs/specs/07-llm-integration.md` before building Task 4.2 or Task 4.3” reflect task numbers at write time and are left as historical record on purpose. The next worker should trust plan numbers from after this follow-up entry to avoid confusion with the new scheme.
- SDK package names for Anthropic / Google adapters are not fixed in the spec. The plan lists common choices (`@anthropic-ai/sdk`, `@google/generative-ai`); adjust Task 4.3 Description if a different SDK is adopted.

**Instructions for the next worker:**
- When starting Task 4.3, reuse 4.1 `OpenAiAdapter` call-policy / key-masking / retry test patterns for both new adapter spec tests.
- Expose `LlmModule` as a provider registry (`Map<providerName, LlmAdapter>` or Nest multi-provider) and resolve adapters by string key consistently on the 4.4 context-builder and 4.5 auto-speak paths.
- When extending `llm/models.ts`, register API model IDs with hyphenated spelling (same as the 4.2 follow-up) and keep `getModelMetadata()` as the single entry point.

## Entry: 2026-05-19 Task 4.3

**Worker context:**
- Phase: Phase 4
- Task: Task 4.3: Anthropic and Google adapters + model metadata expansion
- Dependencies reviewed:
  - Task 4.1
  - Task 4.2
  - Phase 4 Task 4.1 / 4.2 logs
  - Phase 4 plan follow-up log
  - `docs/specs/07-llm-integration.md`
  - `docs/specs/08-security.md`
  - `docs/specs/10-testing.md`
  - Official Anthropic model docs and Google Gemini model docs for representative model metadata

**What was done:**
- Added `AnthropicAdapter` using `@anthropic-ai/sdk` Messages API with `ANTHROPIC_API_KEY` read only inside `src/llm`, 60s timeout, SDK retries disabled, local 5xx/network/timeout retry, 4xx immediate failure, token usage logging, and secret masking.
- Added `GoogleAdapter` using `@google/generative-ai` with `GOOGLE_API_KEY` read only inside `src/llm`, 60s timeout, local retry around `generateContent`, normalized text-helper failures to `ProviderCallFailedError`, token usage logging, and secret masking.
- Added `LlmProviderRegistry` and `UnknownLlmProviderError` so `openai`, `anthropic`, and `google` adapters can be resolved by `providerName`.
- Registered all three adapters and the registry in `LlmModule`.
- Extended `src/llm/models.ts` with representative Anthropic and Google model metadata.
- Added mock-first unit coverage for both new adapters, provider registry resolution, and low/medium/high context-policy math for new representative models.

**Why it matters for the next worker:**
- Task 4.4 context builder can resolve provider adapters through `LlmProviderRegistry` instead of importing concrete adapters directly.
- Anthropic system-role messages are folded into the top-level `system` parameter; Google system-role messages are folded into `systemInstruction`.
- Anthropic default `max_tokens` uses model metadata when caller omits `maxTokens`; keep this behavior if model metadata expands.

**Dependency impact:**
- Satisfies Task 4.3 for Task 4.4 context builder work.
- Introduces `@anthropic-ai/sdk` and `@google/generative-ai` dependencies.
- Keeps provider API keys confined to `src/llm` adapters.

**Files touched:**
- `package.json`
- `pnpm-lock.yaml`
- `src/llm/anthropic.adapter.ts`
- `src/llm/google.adapter.ts`
- `src/llm/llm-provider.registry.ts`
- `src/llm/llm.errors.ts`
- `src/llm/llm.module.ts`
- `src/llm/models.ts`
- `src/llm/__tests__/anthropic.adapter.spec.ts`
- `src/llm/__tests__/google.adapter.spec.ts`
- `src/llm/__tests__/llm-provider.registry.spec.ts`
- `src/llm/__tests__/context-policy.spec.ts`

**Commit:**
- `b883b5834fb49480c582ff580f76ddc8f1fa1b78`

**Verification completed:**
- [x] `./node_modules/.bin/jest src/llm --runInBand`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint "src/llm/**/*.ts"`
- [x] Review subagent `gpt-5.4` reviewed Task 4.3, findings were addressed, and re-review reported no blocker.

**Not verified:**
- [ ] Real Anthropic / Google / OpenAI E2E calls with `LLM_SALON_E2E=1`, because this session did not enable provider API key E2E flows.
- [ ] Full repository test suite; validation was scoped to the LLM module and type/lint checks.

**Open risks or follow-ups:**
- Representative model metadata is intentionally limited. Add more model IDs as provider registration requirements become concrete.
- `LlmModule` is still not imported by the root app module; import it when Task 4.4 or 4.5 first needs DI access from the app graph.

**Instructions for the next worker:**
- For Task 4.4, use `LlmProviderRegistry.get(providerName)` as the adapter lookup path.
- Keep raw provider API keys inside adapter classes only.
- Preserve mock-default adapter tests; run real provider calls only behind `LLM_SALON_E2E=1`.
