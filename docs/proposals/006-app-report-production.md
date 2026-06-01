# Proposal 006: App Report Production

Status: Accepted
Owner: Codex
Created: 2026-06-01
Accepted: 2026-06-01
Related analysis:
- Local failure analysis on 2026-06-01 for topic `4ef8ca24-6864-4fc3-9b5a-bf2a8f5fafae`, where app-only consensus could not enter `drafting` because no active provider existed.

Related specs:
- `docs/specs/02-domain-model.md`
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/07-llm-integration.md`
- `docs/specs/10-testing.md`

Decision:
- `docs/decisions/ADR-005-app-report-production.md`

Planned worklog:
- `docs/worklogs/2026-06-01-app-report-production.md`

## Summary

Allow app-only topics to complete report production after debate consensus. Replace the app participant turn-discovery tools with a single action-discovery tool, `wait_for_action`, and add explicit report artifact submission tools for app reporters.

This solves the current failure mode where all active participants can agree to finalize, but the topic remains in `debating` because the existing report pipeline requires an active provider reporter.

## Problem

The current implementation uses two different meanings of "active":

- participant status `active` means the participant is included in turn-taking and consensus rules
- report production currently requires an active `provider` participant, not just an active participant

In an app-only topic, every participant can be active and consensus-ready while active provider count is still zero. When the final app participant submits `ready_to_finalize`, the system attempts `debating -> drafting`, then fails reporter selection because no active provider exists. The transaction rolls back, the topic stays in `debating`, and the app continues to see itself as responsible for the same turn.

The UI shows both app participants as `ACTIVE`, which is correct for participation but misleading for report capability. The product should not require a provider participant when the whole topic was conducted through app participants.

## Scope

- Included:
- Make app-only topics report-capable after normal completion conditions.
- Preserve provider-first report production when at least one active provider exists.
- Define app reporter selection for topics with no active provider.
- Add explicit report draft and final report submission tools.
- Replace `get_turn`, `is_my_turn`, and `wait_for_turn` with `wait_for_action`.
- Extend context retrieval so `get_context` returns instructions for the caller's current actionable task.
- Keep reviewing feedback on the existing `submit_message` path.
- Keep report content source of truth in the report record.
- Add focused regression coverage for app-only report production.

- Excluded:
- Adding a manual UI reporter picker.
- Reassigning app report tasks on timeout.
- Duplicating report body content into topic messages.
- Changing provider-backed report production except where needed to share reporter semantics.
- Adding authentication, moderation, or multi-user permission controls.

## Proposed Change

### 1. Broaden reporter from provider-only to report lifecycle owner

The existing reporter relationship should mean "the participant that owns report production for the topic."

The reporter may be:

- a provider participant, when an active provider exists
- an app participant, when no active provider exists

The existing `reporterParticipantId` fields remain the storage location for this relationship. No separate app reporter field is introduced.

### 2. Preserve provider-first behavior for mixed topics

When a topic reaches `drafting` and has at least one active provider, the provider-backed pipeline remains the preferred path.

Required behavior:

- active providers are selected before app participants
- mixed app/provider topics preserve the existing server-driven provider report pipeline
- app reporter selection is used only when no active provider exists

This keeps existing provider automation stable while adding app-only completion.

### 3. Select the current turn holder as app reporter

When a consensus topic reaches readiness and has no active provider, the current turn holder becomes the reporter.

Required behavior:

- the final debate message remains a debate message
- the topic transitions to `drafting`
- the current turn holder is stored as the reporter
- a report row is created or reused according to existing drafting-entry rules
- no report draft content is inferred from the final debate message

The app reporter owns both the draft and final report for that topic.

### 4. Add explicit report artifact submission tools

Report draft and final report content should be submitted through dedicated actions rather than through `submit_message`.

Required tools:

```text
submit_report_draft(projectId, topicId, participantId, content)
submit_report_final(projectId, topicId, participantId, content)
```

`submit_report_draft`:

- valid only in `drafting`
- requires `participantId` to match the topic reporter
- stores `content` in the report draft field
- advances the topic to `reviewing`

`submit_report_final`:

- valid only in `finalizing`
- requires `participantId` to match the topic reporter
- stores `content` in the report final field
- writes the final report file using the existing local report file behavior
- advances the topic to `finalized`

Report content is stored only on the report record. The submission tools do not duplicate the report body into topic messages.

### 5. Keep reviewing feedback on `submit_message`

Reviewing feedback remains message-like participant input and continues to use the existing `submit_message` path.

Required behavior:

- during `reviewing`, `submit_message` continues to create feedback
- every active participant, including the reporter, must submit feedback once
- when all active participants have submitted feedback, the topic advances to `finalizing`

The new `action` value `submit_review_feedback` describes the semantic task. It does not require a separate MCP tool.

### 6. Replace turn discovery with action discovery

Remove the app participant contract for:

- `get_turn`
- `is_my_turn`
- `wait_for_turn`

Introduce:

```text
wait_for_action(projectId, topicId, participantId, afterTopicVersion?, timeoutMs?)
```

Purpose:

- provide the single app-facing way to discover whether the caller has actionable work
- support both immediate status checks and bounded long-poll waiting
- cover debate, review, draft report, and final report tasks

Required response fields:

```json
{
  "isActionable": true,
  "action": "submit_report_draft",
  "assignedMember": "Member A",
  "mySelf": "Member A",
  "phase": "drafting",
  "currentRound": 5,
  "currentTurnIndex": 11,
  "serverTime": "2026-06-01T00:00:00.000Z",
  "topicVersion": 23,
  "wakeupReason": "immediate"
}
```

Action values:

- `submit_debate_message`
- `submit_review_feedback`
- `submit_report_draft`
- `submit_report_final`
- `none`

Wakeup reasons:

- `immediate`
- `turn_changed`
- `phase_changed`
- `topic_updated`
- `timeout`
- `closed`

`timeoutMs = 0` means evaluate the current state and return immediately. When omitted, the tool performs bounded long-poll waiting. A non-actionable zero-timeout response returns `isActionable: false`, `action: "none"`, and `wakeupReason: "timeout"`.

No deprecated aliases are kept for the removed turn-discovery tools.

### 7. Define caller-centered assignment

Action discovery is caller-centered.

In phases where only one participant owns the task:

- debate: the current speaker is the assigned member
- drafting: the reporter is the assigned member
- finalizing: the reporter is the assigned member

In `reviewing`, multiple active participants may be actionable at the same time. `wait_for_action` should not expose a full pending-member assignment list. It only needs to tell the caller whether the caller has pending feedback.

Required reviewing behavior:

- if the caller is active and has not submitted feedback, return `isActionable: true`, `action: "submit_review_feedback"`, `assignedMember: mySelf`
- otherwise return `isActionable: false`, `action: "none"`

### 8. Broaden `get_context` to current actionable task context

Do not add `get_report_context`.

`get_context` becomes the context source for the caller's current actionable task. It should include task-appropriate instructions:

- `submit_debate_message`: debate message instruction with `debateSignal`
- `submit_review_feedback`: feedback instruction against the current draft
- `submit_report_draft`: draft report instruction
- `submit_report_final`: final report instruction using the draft and collected feedback

This keeps the app loop simple:

1. `wait_for_action`
2. `get_context`
3. call the submit tool implied by `action`
4. repeat `wait_for_action` unless the topic is finalized or closed

## User-Visible Effects

- app-only topics can finish the report lifecycle
- app participants no longer see a phase transition conflict merely because no provider exists
- MCP onboarding and topic prompt copy point to `wait_for_action`
- app clients receive a direct action value instead of inferring behavior from phase and turn fields
- the dashboard should no longer imply that `ACTIVE` means provider-backed report capability

## Existing Flow Impact Assessment

Provider-backed topics:

- keep provider-first report production
- continue using automatic provider calls for drafting/finalizing
- should not require app report submission tools unless no active provider exists

App-only topics:

- transition to `drafting` when consensus readiness is reached
- assign the current turn holder as reporter
- wait for explicit app submission of draft and final content
- remain in the report-production phase until the app reporter submits the required artifact

Reviewing:

- keeps the existing all-active-participants feedback completion rule
- uses `submit_message` rather than a new feedback tool

MCP tool contract:

- replaces turn-centric discovery with action-centric discovery
- removes deprecated turn-discovery tools immediately
- requires app clients and prompt copy to update

## Implementation Tasks

### Domain and report lifecycle

- Update reporter selection so active providers are preferred, but when none exist the current turn holder can become reporter.
- Ensure `topics.reporter_participant_id` and `reports.reporter_participant_id` can reference app participants.
- Keep report row creation/reuse validation before phase update.
- Preserve existing report duplicate-row safeguards.
- Ensure app report tasks remain open across wait timeouts.

### Report artifact submission

- Add HTTP endpoints for report draft and final report submission.
- Add MCP tools `submit_report_draft` and `submit_report_final`.
- Validate phase and reporter ownership.
- Persist draft/final content on the report record only.
- Reuse existing final report file writing behavior for app-submitted final content.
- Emit the existing report and phase events after successful commits.

### Action discovery

- Replace `get_turn`, `is_my_turn`, and `wait_for_turn` MCP tools with `wait_for_action`.
- Replace or remove the corresponding HTTP turn-discovery endpoints as appropriate for the new contract.
- Return `isActionable`, `action`, `assignedMember`, `mySelf`, phase, round/turn metadata, server time, topic version, and wakeup reason.
- Support `timeoutMs = 0` as immediate evaluation.
- Treat `drafting` and `finalizing` as waitable phases when the caller is the reporter.
- Keep reviewing caller-centered and avoid returning a pending-member list.

### Context generation

- Extend `get_context` to generate task-specific instructions based on `wait_for_action` semantics.
- Include report draft context in `drafting`.
- Include draft content and feedback context in `finalizing`.
- Keep debate and feedback context compatible with existing prompts where possible.

### Documentation

- Update `docs/specs/02-domain-model.md` for reporter ownership, app reporter selection, and phase transitions.
- Update `docs/specs/05-api.md` for new report endpoints and action wait response.
- Update `docs/specs/06-mcp.md` for removed tools, `wait_for_action`, and report submission tools.
- Update `docs/specs/07-llm-integration.md` for the new app loop and current-task context.
- Update `docs/specs/10-testing.md` with regression cases.
- Update `docs/user-guide.md`, README, and dashboard prompt copy text.
- Keep `docs/CONTEXT.md` aligned with accepted terminology.

### Tests

- App-only consensus transitions from `debating` to `drafting` without an active provider.
- Current turn holder becomes reporter when no active provider exists.
- Mixed app/provider topics still select an active provider reporter.
- `wait_for_action(timeoutMs=0)` returns immediate action state.
- `wait_for_action` returns `submit_report_draft` for the app reporter in `drafting`.
- `submit_report_draft` rejects non-reporters and wrong phases.
- `submit_report_draft` stores draft content and advances to `reviewing`.
- `wait_for_action` returns `submit_review_feedback` for active participants without feedback.
- Reporter also must submit feedback during `reviewing`.
- `wait_for_action` returns `submit_report_final` for the reporter in `finalizing`.
- `submit_report_final` stores final content, writes the file, and advances to `finalized`.
- Removed tools are absent from the MCP tool list.
- Anonymous MCP responses do not expose provider/client/model/display identifiers.

## Alternatives Considered

### Option A: Keep provider-only report production

Rejected.

Pros:

- preserves existing server-driven provider report generation
- avoids adding app report submission tools

Cons:

- app-only topics can agree but cannot complete
- users see active participants while finalization still fails
- the product unnecessarily requires a provider for an app-led discussion

### Option B: Let the user choose an app reporter

Rejected for this proposal.

Pros:

- gives the user explicit control
- could handle cases where the current turn holder is not preferred

Cons:

- adds a human scheduling step to an otherwise participant-driven lifecycle
- requires additional UI/API state before the core app-only failure is fixed

### Option C: Treat the final debate message as the report draft

Rejected.

Pros:

- fewer tools
- one less app round trip

Cons:

- overloads a debate statement as a report artifact
- blurs the existing distinction between messages and reports
- makes the final debate turn carry two incompatible responsibilities

### Option D: Add separate report context tool

Rejected.

Pros:

- keeps debate context and report context separate
- makes report-specific payloads explicit

Cons:

- complicates the app loop
- introduces a new class of "wrong context tool" mistakes
- conflicts with the new action-discovery model where context should follow the current action

### Option E: Keep `get_turn`, `is_my_turn`, and `wait_for_turn`

Rejected.

Pros:

- less breaking surface
- preserves existing prompt copy and some tests

Cons:

- requires adding action semantics to multiple overlapping tools
- keeps turn-centric terminology in report phases
- makes app orchestration more error-prone

### Option F: Replace turn discovery with `wait_for_action`

Accepted.

Pros:

- aligns tool naming with the new action-centered model
- gives app clients one stable discovery loop
- handles immediate status checks and long-poll waiting in one contract

Cons:

- breaking MCP contract
- requires updating docs, tests, prompt copy, and app instructions

## Open Risks

- Existing app prompts or saved user instructions that mention `get_turn`, `is_my_turn`, or `wait_for_turn` will need updating.
- `wait_for_action` must be carefully implemented so `timeoutMs=0` does not accidentally hold requests open.
- The provider pipeline and app-submitted pipeline must share report lifecycle invariants without duplicating too much logic.
- Context generation now depends more heavily on caller, phase, and action; snapshot tests should cover this.
