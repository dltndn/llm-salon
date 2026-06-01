# Proposal 004: Dashboard UI Management Improvements

Status: Accepted
Owner: Codex
Created: 2026-05-28
Accepted: 2026-06-01
Related analysis:
- Local documentation and implementation review on 2026-05-28 covering dashboard SSR flow, participant visibility, topic visibility, anonymized naming, and project/topic management affordances

Related specs:
- `docs/specs/02-domain-model.md`
- `docs/specs/04-database.md`
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/10-testing.md`

Decision:
- `docs/decisions/ADR-004-dashboard-ui-management-improvements.md`

Planned worklog:
- `docs/worklogs/2026-06-01-dashboard-ui-management-improvements.md`

## Summary

Improve the human-facing project dashboard so project membership is visible before any topic exists, debate messages show the participant's anonymous member label alongside the existing display name, project and topic UUIDs can be copied directly together with fixed English MCP onboarding prompts, participants can be removed from future participation without deleting their history, and topics can be hidden from normal UI flows through a soft-delete timestamp while preserving their records.

## Problem

The current dashboard and human-facing project flow have four practical gaps:

- participant identity in message history is hard to cross-reference with the anonymized `Member A/B/...` identity used in MCP and LLM-facing flows
- project participants are only practically visible inside the topic dashboard flow, even though project membership exists before topic creation
- project and topic UUIDs are available in data responses but are not surfaced for quick copy or for MCP onboarding help
- the UI provides no management affordance to remove a participant from future turns or to hide a no-longer-needed topic from normal dashboard use

These gaps are primarily dashboard and human-operator workflow issues, but they touch current contracts in a few places:

- participant removal must align with the existing `removed` lifecycle semantics
- topic hiding should not destroy debate history, reports, or references
- UUID-based prompt copy should fit the existing MCP command and onboarding flow

This is not a request to change LLM-facing anonymization rules, debate logic, or historical data retention.

## Scope

- Included:
- Show `anonymousName` as a parenthetical label in message headers only.
- Keep participant list and current-turn display unchanged.
- Show project participants in an always-visible project-level dashboard section, even when no topic exists yet.
- Show partial project and selected-topic UUIDs in the human dashboard.
- Add two copy affordances per visible UUID: raw UUID copy and fixed English MCP prompt copy.
- Support participant removal by excluding that participant from future participation while preserving their existing records.
- Support topic hiding from normal UI flows by adding `topics.deleted_at` and excluding deleted topics from normal dashboard and default project-detail responses.
- Preserve deleted-topic records for internal/API/data access rather than destructive deletion.

- Excluded:
- Hard-deleting participants, topics, messages, turns, documents, or reports.
- Any change to LLM-facing anonymization payload rules.
- Showing `Member A/B/...` in the participant list or current-turn banner.
- Restoring hidden topics through the human dashboard.
- Hiding or removing existing message/report history from storage.
- Broad redesign of dashboard layout beyond what is needed for the new management affordances.

## Proposed Change

### 1. Show anonymous labels in message headers only

Human-facing message cards in the dashboard should render the existing display name plus the participant's anonymous label in parentheses.

Example:

- `Codex / GPT-5 (Member A)`
- `gpt-5.4 (Member B)`

This is intentionally limited to message headers.

The following places stay unchanged:

- participant list rows
- current-turn summary
- non-message participant displays elsewhere in the dashboard unless explicitly updated by a future proposal

Rationale:

- it helps the human operator map browser-visible discussion history to MCP- and LLM-facing member identities
- it avoids expanding anonymous labels into every part of the dashboard unnecessarily
- it stays consistent with the current anonymization boundary because this is human-facing UI only

### 2. Make the project participant list always visible

The dashboard should treat participants as a project-level concern, not a topic-dependent one.

Required behavior:

- a project-level participant section is always visible on the dashboard
- the participant section is shown even when the project has no topics yet
- when topics do exist, the participant section remains in the same persistent dashboard area rather than moving into a topic-specific empty state

This proposal does not change participant semantics. It only changes when and where the human-facing dashboard exposes the already-existing project membership.

### 3. Surface project/topic UUID snippets and copy actions

The human dashboard should surface:

- project UUID snippet: first 4 characters, ellipsis, last 4 characters
- selected topic UUID snippet: first 4 characters, ellipsis, last 4 characters

Each surfaced UUID should provide two copy actions:

- copy raw UUID
- copy a fixed English MCP prompt

Prompt types are intentionally separate:

- project prompt: helps a new app join the project using the project UUID
- topic prompt: helps an already-joined app operate on the selected topic using the topic UUID

The copied prompts must be English-only regardless of `LLM_SALON_OUTPUT_LANGUAGE`.

The proposal does not require these prompts to become CLI output or new MCP tools. They are dashboard convenience strings built from existing MCP workflow expectations.

Accepted prompt text:

- Project prompt:

```text
Join the LLM-Salon project using projectId "<PROJECT_ID>". If the MCP server is not configured yet, add an MCP server named "llm-salon" using the command `llm-salon mcp`, then call join_project with this projectId.
```

- Topic prompt:

```text
Use topicId "<TOPIC_ID>" for the current LLM-Salon topic. After joining the project, call get_turn and wait_for_turn with this topicId, and submit messages with submit_message when it is your turn.
```

### 4. Participant removal uses the existing `removed` lifecycle

Human-facing participant deletion in the dashboard should map to the existing participant lifecycle instead of introducing hard deletion.

Required behavior:

- removing a participant updates `participant.status` to `removed`
- removed participants are excluded from future turn-taking and other downstream active-participant flows under the current lifecycle rules
- existing messages, turns, reports, and anonymous-name history remain intact
- removed participants remain counted for anonymous-name non-reuse and uniqueness semantics already defined by the current specs

Guardrail:

- the current in-progress turn holder cannot be removed

This guard prevents immediate ambiguity in message submission and turn advancement flows.

### 5. Topic hiding uses `deletedAt` soft delete

Topic deletion in the dashboard should not destroy stored debate history. Instead it should introduce a soft-delete timestamp on the topic record.

Required behavior:

- add `deleted_at timestamptz null` to `topics`
- a topic is considered hidden from normal UI flows when `deleted_at` is not null
- hidden topics are excluded from:
  - dashboard topic tabs
  - default selected-topic resolution
  - normal "project detail" topic lists returned to human clients unless a future explicit include-hidden mode is added

Historical records remain stored:

- messages
- turns
- documents
- reports

This proposal intentionally does not add a UI path to re-show hidden topics.

### 6. Restrict which topics can be hidden

To avoid conflicting with the active state machine, topic hiding is allowed only when the topic phase is:

- `preparing`
- `finalized`
- `closed`

Topic hiding is rejected for:

- `debating`
- `drafting`
- `reviewing`
- `finalizing`

This keeps the proposal aligned with the current phase model and avoids interrupting active orchestration or report generation flows.

## User-Visible Effects

- message history becomes easier to reconcile with anonymized member identities
- participants are visible before the first topic exists
- operators can quickly copy project/topic identifiers and ready-made English onboarding prompts
- participants can be removed from future participation without destroying history
- old or no-longer-needed topics disappear from normal dashboard navigation without losing stored records

## Existing Flow Impact Assessment

This proposal should not change the core debate orchestration flow if implemented as specified.

Changes with effectively display-only impact:

- showing `anonymousName` in message headers
- always-visible project participant section
- UUID snippet display and copy buttons

Changes that do alter system behavior, but in a constrained and backward-compatible way:

- participant removal through the existing `removed` state
- topic hiding through `deleted_at` filtering

These behavioral changes are intentionally scoped to management and visibility:

- no change to turn order rules other than the already-defined consequences of `removed`
- no change to message, report, or anonymization content rules
- no destructive deletion of historical records
- no new LLM-facing identity leakage

## Affected Documents

- `docs/specs/02-domain-model.md`
  Clarify participant-removal semantics in the human management flow and define topic hide eligibility constraints against the current phase model.
- `docs/specs/04-database.md`
  Add `topics.deleted_at` and document its meaning.
- `docs/specs/05-api.md`
  Update dashboard layout expectations, visible participant rules, message-header labeling, UUID copy affordances, and any new management endpoints or filtered project-detail behavior.
- `docs/specs/06-mcp.md`
  Document the fixed English prompt-copy intent as a human dashboard convenience that references existing MCP onboarding flow without changing MCP response contracts.
- `docs/specs/10-testing.md`
  Add regression coverage for participant removal guards, soft-hidden topic filtering, and the new dashboard display rules.
- `docs/user-guide.md`
  Update dashboard/operator guidance if the proposal is accepted and implemented.

## Alternatives Considered

### Option A: Show `Member A/B/...` everywhere in the dashboard

Rejected as the primary design.

Pros:

- maximum consistency across all human-visible participant displays

Cons:

- broader UI churn than needed
- adds noise to participant list and current-turn summary
- not required for the stated operator workflow problem

### Option B: Keep participant visibility topic-dependent

Rejected.

Pros:

- no layout changes

Cons:

- preserves the current inability to inspect project membership before topic creation
- mismatches the project-level nature of participant registration

### Option C: Hard-delete participants and topics

Rejected.

Pros:

- simpler UI mental model

Cons:

- conflicts with current history-preservation needs
- risks breaking references and auditability
- conflicts with existing anonymous-name permanence and topic/report history expectations

### Option D: Hide topics by moving them to `closed` only

Rejected as the sole mechanism.

Pros:

- reuses an existing phase value

Cons:

- `closed` is currently a lifecycle state, not a visibility flag
- does not distinguish "completed lifecycle" from "hidden from normal dashboard UI"
- cannot cleanly represent a hidden `preparing` topic

### Option E: Soft-hide topics with `deletedAt` and filter them from normal UI

Recommended.

Pros:

- preserves records
- keeps normal dashboard navigation clean
- separates lifecycle state from visibility state

Cons:

- adds a schema field and filtering responsibilities
- requires care in project-detail and selected-topic resolution logic

## Risks

- Topic filtering may accidentally hide records from paths that still need historical access.
- Mitigation: define precisely which default human-facing routes filter hidden topics and leave explicit non-default/internal access paths unchanged.

- Participant removal could be attempted on the current turn holder and create confusing UX.
- Mitigation: reject removal of the current in-progress turn holder and test the guard explicitly.

- The English prompt-copy text could drift away from the real MCP onboarding flow.
- Mitigation: keep the copied prompts aligned with the MCP install prompt and current tool flow described in `docs/specs/06-mcp.md`.

- `deletedAt` may be misread as destructive deletion by future contributors.
- Mitigation: document clearly that hidden topics preserve all history and only affect default visibility and management behavior.

## Acceptance Notes

Before this proposal is accepted, the repository should agree that:

- human-facing message headers may show both display name and anonymous label without affecting anonymization rules
- participant visibility in the dashboard is project-level and should not depend on topic existence
- copied UUID prompts are fixed in English and are dashboard conveniences, not new MCP contracts
- participant deletion in the UI means transition to `removed`, not data deletion
- topic deletion in the UI means setting `deletedAt`, not deleting rows
- hidden topics remain historically preserved but are excluded from normal human-facing UI and default project-detail topic lists
- hidden-topic support does not include dashboard restore/re-show UI in this proposal
- current turn holders cannot be removed
- topic hiding is allowed only in `preparing`, `finalized`, or `closed`

Before this proposal is reflected in live specs, the following should be true:

- the affected spec files above define the filtering and management semantics explicitly
- the proposal names the default access paths that exclude hidden topics
- the implementation plan identifies the human-facing routes and presenters that must surface UUID copy affordances and message-header anonymous labels

## Status History

- 2026-05-28: Draft created for dashboard UI and management improvements spanning participant visibility, identity labeling, UUID copy affordances, participant removal, and topic soft-hiding.
- 2026-06-01: Accepted with fixed English MCP prompt-copy strings and REST management endpoints to be reflected in specs.
