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
