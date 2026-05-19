# Phase 6: Report pipeline

## Entry: 2026-05-19 Task 6.1

**Worker context:**
- Phase: Phase 6
- Task: Task 6.1 — Reporter selection + drafting entry
- Dependencies reviewed:
  - Task 4.5 (`phase-4-llm-adapter-and-context-builder.md`)
  - Phase 5 checkpoint (`phase-5-mcp-stdio-interface.md`)

**What was done:**
- Added `selectReporterParticipantId()` to pick the lowest `join_order` active `provider` participant.
- Added `ReportsService.beginDrafting()` to set `topics.reporter_participant_id`, create or reuse a `reports` row with `status=drafting`, and emit `topic.phase_changed`.
- Wired `MessagesService` debating → drafting transition to call `beginDrafting()` inside the existing message transaction.
- Added `ReportAlreadyExistsError` for non-resumable or duplicate report rows (`04-database.md` one-row-per-topic invariant).
- Resolved report path with `findMany({ take: 2 })` before topic phase update; `beginDrafting()` returns the report id for Task 6.2.
- Added unit and integration tests for reporter selection, drafting entry, report reuse, duplicate-row guard, and failure-path event/topic assertions.

**Why it matters for the next worker:**
- Task 6.2 should consume the report id returned from `beginDrafting()` (or load the single `status=drafting` row with null `draft_content`); do not add a second drafting entry path.
- `report.draft_created` is reserved for when draft content is saved (spec trigger: “Draft report saved”); Task 6.1 emits only `topic.phase_changed`.
- Drafting requires at least one active provider; otherwise `PhaseTransitionError` is raised.
- If more than one report row exists for a topic, `ReportAlreadyExistsError` is raised; do not assume `findFirst()` is safe.

**Dependency impact:**
- Satisfies Phase 6 entry prerequisite from Task 4.5 (message submit + phase transition path).
- Downstream Task 6.2 depends on `reports.status=drafting`, `reporterParticipantId`, and the returned report id.

**Files touched:**
- `src/reports/reporter-selector.ts`
- `src/reports/reports.service.ts`
- `src/messages/messages.service.ts`
- `src/messages/messages.module.ts`
- `src/common/errors/domain.errors.ts`
- `src/common/errors/domain-exception.filter.ts`
- `src/reports/__tests__/reporter-selector.spec.ts`
- `test/reports-drafting.spec.ts`
- `test/messages.spec.ts`

**Commit:**
- `e430228`

**Verification completed:**
- [x] `npm test -- src/reports/__tests__/reporter-selector.spec.ts test/reports-drafting.spec.ts test/messages.spec.ts`
- [x] `npm run typecheck`

**Not verified:**
- [ ] Full repository `jest --runInBand`
- [ ] Real DB integration for drafting transition

**Design decisions:**
- Reporter selection lives in `reports/` and is invoked from `messages/` only for the debating → drafting transition.
- Draft queue contract: one report row per topic with `status=drafting` and null `draft_content`. `beginDrafting()` returns the report id for Task 6.2 to consume directly.
- Report rows are validated (`findMany` max 2) before `tx.topic.update()` so failure paths do not advance topic phase or emit `topic.phase_changed`.
- Idempotent drafting entry reuses an existing row when `status` is `none` or `drafting` and no draft/final content exists; otherwise `ReportAlreadyExistsError`.
- More than one existing report row per topic always raises `ReportAlreadyExistsError`.
- No `report.draft_created` event at queue time; Task 6.2 should emit it when draft content is persisted.

**Deviations from spec:**
- None.

**Trade-offs:**
- `beginDrafting()` throws `PhaseTransitionError` when no active provider exists instead of introducing a new domain error type.
- Duplicate-row detection uses application-level `findMany({ take: 2 })` because the DB has no unique constraint on `(topic_id)` for reports.

**Open questions:**
- [x] Which domain event marks drafting queue vs draft saved? → `topic.phase_changed` on entry; `report.draft_created` deferred to Task 6.2 per `02-domain-model.md` event table.

**Open risks or follow-ups:**
- Task 6.2 must implement actual LLM draft generation and transition `drafting → reviewing`.
- Topics with only `app` participants cannot enter drafting until a provider is registered.

**Instructions for the next worker:**
- Start Task 6.2 using the report id from `beginDrafting()` (or the sole `status=drafting` row) to fill `reports.draft_content` and emit `report.draft_created`.
- Reuse `reporter-selector.ts`; do not duplicate reporter selection logic.
- Preserve validate-report-before-topic-update ordering when extending the pipeline.

---

## Entry: 2026-05-19 Task 6.2

**Worker context:**
- Phase: Phase 6
- Task: Task 6.2 — Draft / feedback / final report LLM calls
- Dependencies reviewed:
  - Task 6.1 (`phase-6-report-pipeline.md` entry above)
  - Task 4.4 (context builder / anonymization patterns)

**What was done:**
- Added `src/llm/output-languages.ts` and report system prompt helpers in `src/prompt/report-prompts.ts` (drafting / reviewing / finalizing stages + output-language directive).
- Implemented `ReportPipelineService` to run reporter LLM calls on `topic.phase_changed` → `drafting` and `finalizing`, persist draft/final content, write a Markdown file under `LLM_SALON_HOME/projects/<slug>/reports/`, and emit `report.draft_created` / `report.created`.
- Extended `MessagesService` for `reviewing` phase feedback (`MessageKind.feedback`), duplicate-feedback guard, and auto `reviewing → finalizing` when every active participant has submitted once.
- Added unit snapshot tests for report prompts and an integration test `test/report-pipeline.spec.ts` (mock LLM end-to-end through `finalized`).
- Updated in-memory Prisma test doubles for report-pipeline queries (`report.findFirst` by id, `message.findMany`, `document.findMany`).

**Review feedback (addressed before commit):**

*Round 1 — initial review*
- **[P1] Async pipeline unhandled rejections:** `runExclusive()` now wraps both `draft` and `finalize` stages, catches all errors (document reads, file writes, DB transactions—not only LLM calls), logs via `logPipelineFailure()`, and leaves the topic phase unchanged on failure.
- **[P2] Non-hermetic tests:** `test/report-pipeline.spec.ts` sets `LLM_SALON_HOME` to a `mkdtemp` directory per test and removes it in `afterEach`; assertions check `filePath` under that temp home. Stray `projects/` artifacts from earlier runs were deleted from the worktree.
- **[P2] Unsafe `findFirst()` on finalizing:** `maybeAdvanceToFinalizing()` uses `report.findMany({ take: 2 })`, no-ops when row count ≠ 1, and requires `status=reviewing`, `draftContent != null`, `finalContent == null` before `reviewing → finalizing` (via `resolveReportForFinalizing()`).
- **Regression tests added:** document read failure, final file write failure, duplicate report rows, non-reviewing report status during feedback completion.

*Round 2 — lint follow-up*
- **[P2] Unused import:** removed unused `ParticipantStatus` from `src/reports/report-pipeline.service.ts` so `npm run lint` passes.

**Why it matters for the next worker:**
- Task 6.3 should replace the inline file write in `ReportPipelineService` with `storage/local-storage.service.ts` and add traversal guards per `08-security.md`.
- Report file paths already use `projects/<slug>/reports/<topicId>-<timestamp>.md`; 6.3 can keep that layout and harden resolution.
- Draft/final LLM work is async off domain events; do not add a second drafting entry path.

**Dependency impact:**
- Satisfies Task 6.2 acceptance criteria from the plan (phase transitions, output-language mapping, mock e2e to `finalized`).
- Downstream Task 6.3 depends on finalized reports having `reports.file_path` populated.

**Files touched:**
- `src/llm/output-languages.ts`
- `src/prompt/report-prompts.ts`
- `src/reports/report-pipeline.service.ts`
- `src/reports/reports.module.ts`
- `src/messages/messages.service.ts`
- `src/llm/__tests__/output-languages.spec.ts`
- `src/prompt/__tests__/report-prompts.spec.ts`
- `src/prompt/__tests__/__snapshots__/report-prompts.spec.ts.snap`
- `test/report-pipeline.spec.ts`
- `test/reports-drafting.spec.ts`
- `test/messages.spec.ts`

**Commit:**
- `ea93684`

**Verification completed:**
- [x] `npm test -- test/report-pipeline.spec.ts test/reports-drafting.spec.ts test/messages.spec.ts src/prompt/__tests__/report-prompts.spec.ts src/llm/__tests__/output-languages.spec.ts` (21 passed, 1 skipped after review fixes)
- [x] `npm run typecheck`
- [x] `npm run lint` (after removing unused `ParticipantStatus` import)

**Not verified:**
- [ ] Full repository `jest --runInBand`
- [ ] Real DB integration for report pipeline
- [ ] `LLM_SALON_E2E=1` reporter calls

**Design decisions:**
- Three reporter LLM stages: draft on `drafting`, feedback summary on `finalizing` (reviewing prompt), then final report (finalizing prompt).
- Feedback collection uses HTTP/MCP `submit_message` during `reviewing` without turn locks; one feedback per active participant.
- Invalid `LLM_SALON_OUTPUT_LANGUAGE` continues to fall back via existing `validateEnv` at boot (no duplicate warning path in pipeline).
- Final Markdown is written directly in the pipeline until Task 6.3 introduces `storage/`.

**Deviations from spec:**
- None identified.

**Trade-offs:**
- File writes omit `path.resolve` traversal checks until Task 6.3.
- LLM and I/O failures log a warning and leave the topic in the current phase (no automatic retry); `runExclusive()` prevents unhandled promise rejections from crashing the process.

**Open questions:**
- [x] Which domain event marks drafting queue vs draft saved? → unchanged from 6.1; `report.draft_created` now emitted when draft content is saved.

**Open risks or follow-ups:**
- Task 6.3 should centralize report file I/O and collision-safe naming policy.
- Provider auto-speak during `reviewing` is not applicable (no in-progress turns); apps must submit feedback explicitly.

**Instructions for the next worker:**
- Start Task 6.3 by extracting `writeFinalReportFile()` from `ReportPipelineService` into `storage/local-storage.service.ts` with base-path checks.
- Keep report pipeline event-driven; avoid synchronous LLM calls inside message transactions.

---

## Entry: 2026-05-19 Task 6.3

**Worker context:**
- Phase: Phase 6
- Task: Task 6.3 — Report file storage and path guard
- Dependencies reviewed:
  - Task 6.2 (`phase-6-report-pipeline.md` entry above)
  - `08-security.md` File System Boundaries
  - `01-architecture.md` User Data Directory

**What was done:**
- Added `LocalStorageService` with `resolveProjectRelativePath()` and `writeReportMarkdown()` under `src/storage/`.
- Enforced safe path segments (`..`, separators, null bytes rejected) and `path.resolve` + base-prefix checks (project base for relative paths; `reports/` base for final Markdown writes).
- `writeReportMarkdown()` validates `topicId` and the generated filename before join; final path must stay under `projects/<slug>/reports/`.
- Report filenames: `<topicId>-<timestamp>.md` first; on `EEXIST`, retry with `<topicId>-<timestamp>-1.md`, `-2.md`, … (`writeFile` `flag: 'wx'`).
- Wired `StorageModule` into `ReportsModule`; `ReportPipelineService` delegates final Markdown I/O to storage.
- Added unit tests for traversal rejection (project slug, segments, `topicId`), successful writes, distinct timestamps, and same-millisecond collision retry.
- Extended `test/report-pipeline.spec.ts` to read the saved Markdown from `report.filePath` and assert it matches `finalContent`.

**Why it matters for the next worker:**
- Phase 7 README can reference centralized report storage under `LLM_SALON_HOME/projects/<slug>/reports/`.
- Documents module may later reuse `LocalStorageService` for attachment path hardening (out of 6.3 scope).

**Dependency impact:**
- Satisfies Task 6.3 acceptance criteria (traversal block, timestamp suffix, `reports.file_path` unchanged contract).
- Integration test asserts DB `filePath` prefix and on-disk Markdown equals `finalContent` (Phase 6 checkpoint partial).

**Files touched:**
- `src/storage/storage.errors.ts`
- `src/storage/local-storage.service.ts`
- `src/storage/storage.module.ts`
- `src/storage/__tests__/local-storage.spec.ts`
- `src/reports/report-pipeline.service.ts`
- `src/reports/reports.module.ts`
- `test/report-pipeline.spec.ts`

**Review feedback (addressed before commit):**
- **[P2] Report files escaping `reports/`:** `writeReportMarkdown()` now validates `topicId` and generated `fileName`, resolves against `reportsDirectory`, and checks containment under `reports/` (not only project base). Regression tests added for malformed `topicId`.
- **[P3] Log overstated disk verification:** integration test now reads `report.filePath` and compares file content to `finalContent`; log wording adjusted.
- **[P2] Same-millisecond filename collision:** `writeFile(..., { flag: 'wx' })` with retry using `<topicId>-<timestamp>-<n>.md` suffixes; regression test for two writes at the same `Date.now()`.
- **[P3] Commit trailers:** Task 6.3 commits recreated without `Co-authored-by` tool attribution.

**Commit:**
- `338234d` (code), `e11ca65` (docs log)

**Verification completed (after final rewrite / collision fix):**
- [x] `pnpm test -- src/storage/__tests__/local-storage.spec.ts` (16 passed)
- [x] `pnpm run typecheck`
- [x] `pnpm run lint`

**Not verified / environment notes:**
- [ ] `test/report-pipeline.spec.ts` in combined `npm test` target — existing Supertest `serverAddress()` null `port` failure in some environments; storage suite passes; integration disk-content assertion added in Task 6.3 but not re-verified here after collision rewrite
- [ ] Full repository `jest --runInBand`

**Design decisions:**
- `PathTraversalError` lives in `storage/` (not domain errors) because it is filesystem-boundary specific.
- `resolveLlmSalonHome()` reused for home resolution consistency with boot/CLI paths.

**Deviations from spec:**
- None identified.

**Open risks or follow-ups:**
- `DocumentsService` still writes under `LLM_SALON_HOME/documents/` without traversal guards; consider a follow-up if attachments accept user-supplied names at scale.

**Instructions for the next worker:**
- Proceed to Phase 7 Task 7.1 (README / user guide).

---

## Checkpoint: Phase 6

- [x] One topic runs `preparing → finalized` end-to-end with mock LLM (`test/report-pipeline.spec.ts` — `runs preparing through finalized with mock LLM (phase 6 checkpoint)`).
- [x] Report file on disk matches DB `reports.file_path` and `finalContent` (`readFile(report.filePath)` assertion in the same test).

**Verification completed:**
- [x] `npm test -- test/report-pipeline.spec.ts test/reports-drafting.spec.ts test/messages.spec.ts src/storage/__tests__/local-storage.spec.ts src/reports/__tests__/reporter-selector.spec.ts`
- [x] `npm run typecheck`
- [x] `npm run lint`

**Not verified:**
- [ ] Full repository `jest --runInBand`
- [ ] Real DB integration for report pipeline
