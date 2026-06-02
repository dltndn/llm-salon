# 10 — Testing Strategy

> Source of truth: `docs/initial-plannings/tech-spec.md` §13

---

## Unit Tests

### Anonymization Guard
- Bidirectional: verify that `HumanDto` fields (`display_name`, `provider_name`, `model_name`, `client_name`) are present in human-facing responses and **absent** from all LLM-facing / MCP responses.
- Test both the whitelist check (only expected fields present) and blacklist check (forbidden fields absent).

### Round-Robin Algorithm (`turns/`)
- Table-driven tests covering: normal rotation, participant skip (inactive/removed), round increment, late join (next-round-only), single participant edge case.
- Service tests verify that creating a participant's first assigned turn promotes a `waiting` participant to `active` in the same transaction.

### Topic Phase State Machine (`topics/`)
- All valid transitions pass.
- All invalid transitions raise `PhaseTransitionError`.
- Consensus early stop: a `consensus` topic transitions from `debating` to `drafting` when every active participant's latest debating `statement` has `debateSignal = ready_to_finalize`.
- Consensus first-turn guard: a `waiting` participant that belongs to the current round receives their first turn before early stop can move the topic to `drafting`.
- Consensus reset: any active participant's later `continue` signal prevents early stop until unanimity is reached again.
- Options mode: `ready_to_finalize` signals do not early-stop `options` topics.
- Concurrent duplicate transitions are rejected.
- App-only consensus readiness enters `drafting` without an active provider and assigns the consensus-completing current turn holder as reporter.
- App-only configured round/turn limit completion enters `drafting` without an active provider and assigns the current turn holder as reporter.
- Mixed app/provider topics preserve active-provider reporter preference.

### Context Profile Policy (`llm/context-policy.ts`)
- For each profile (`low`, `medium`, `high`): verify token budget calculation, per-file size limit, per-project size limit.
- Verify fallback to `medium` on invalid/missing profile value.

---

## Integration Tests

### REST + SSE (Supertest)
- Project creation → topic creation → participant registration → message submission flow.
- SSE event delivery after message submission.
- `409` response when a non-current participant attempts to submit.
- Action-wait endpoint with `timeoutMs=0` returns the current action state immediately.
- Action-wait endpoint wakes on turn or phase changes and returns updated `topicVersion` plus `wakeupReason`.
- Action-wait endpoint times out cleanly and supports client re-call behavior.
- App reporter draft submission stores report content, advances to `reviewing`, and does not create a report-body topic message.
- App reporter final submission stores report content, writes the report file, advances to `finalized`, and does not create a report-body topic message.

### Database (Prisma)
- Use `testcontainers` or a local PostgreSQL temporary schema.
- Transaction atomicity: verify that a message insert failure rolls back the turn advance.

### MCP (stdio)
- Spawn the `llm-salon mcp` child process and run JSON-RPC message round-trips.
- Verify tool response anonymization: no human-facing fields in any tool response.
- Verify `wait_for_action` blocks until wakeup or timeout and preserves the anonymous response contract.
- Verify removed tools `get_turn`, `is_my_turn`, and `wait_for_turn` are absent from the MCP tool list.
- Verify `submit_report_draft` and `submit_report_final` reject wrong phases and non-reporters.
- Verify a join-only MCP flow registers the app participant, allows project status inspection, and does not create a topic, add a document, or submit a message when no topic exists.
- Verify `get_project_status` for a project with no current topic returns `topic: null`, `phase: null`, and no topic-scoped turn state.
- Verify `llm-salon mcp install-prompt` clearly separates project registration from topic creation and message submission.

---

## LLM Adapter Tests

- Real provider calls are **disabled by default**.
- Enable with `LLM_SALON_E2E=1`.
- Default: SDK is mocked with deterministic responses.

---

## Regression Tests

These specific scenarios must have permanent test coverage:

| Scenario | Expected outcome |
|---|---|
| Message submitted → SSE event | Exactly 1 SSE event emitted per message |
| Two participants submit to the same turn concurrently | One succeeds; the other receives `409 Conflict` |
| `wait_for_action(timeoutMs=0)` for the current debate turn holder | Returns immediately with `isActionable: true`, `action: "submit_debate_message"`, and `wakeupReason: "immediate"` |
| `wait_for_action(timeoutMs=0)` for a non-actionable caller | Returns immediately with `isActionable: false`, `action: "none"`, and `wakeupReason: "timeout"` |
| `wait_for_action` after another participant submits a message | Returns with updated `topicVersion` and `wakeupReason: "turn_changed"` |
| `wait_for_action` timeout with no state change | Returns `wakeupReason: "timeout"` and can be called again safely |
| `submit_message` with wrong participant | Returns `WRONG_TURN` error with current member's anonymous name |
| `submit_message` with unanimous consensus readiness | Returns `{ nextMember: null, phaseAfter: "drafting" }` |
| `submit_message` with a current-round waiting participant | Returns the waiting participant as `nextMember` and promotes them to `active` before consensus early stop can complete |
| App-only unanimous consensus readiness | Enters `drafting` and assigns the consensus-completing current turn holder as reporter |
| App-only configured debate limit completion | Enters `drafting` and assigns the current turn holder as reporter |
| Mixed app/provider unanimous consensus readiness | Enters `drafting` and assigns an active provider as reporter |
| `wait_for_action` for app reporter in `drafting` | Returns `action: "submit_report_draft"` |
| `submit_report_draft` from non-reporter or wrong phase | Rejects the request without changing report content or topic phase |
| `submit_report_draft` from app reporter | Stores draft content only on the report row and advances to `reviewing` |
| `wait_for_action` for active participant without feedback | Returns `action: "submit_review_feedback"` and `assignedMember: mySelf` |
| Reviewing feedback from reporter | Counts toward all-active-participants review completion |
| `wait_for_action` for app reporter in `finalizing` | Returns `action: "submit_report_final"` |
| `submit_report_final` from non-reporter or wrong phase | Rejects the request without changing report content, file state, or topic phase |
| `submit_report_final` from app reporter | Stores final content only on the report row, writes the Markdown file, and advances to `finalized` |
| Removed turn-discovery MCP tools | MCP tool list omits `get_turn`, `is_my_turn`, and `wait_for_turn` |
| App report lifecycle MCP responses | Do not expose provider, client, model, or display identifiers |
| Document upload exceeding profile limit | Returns `413` with descriptive message |
| Dashboard message history | Shows `displayName` plus anonymous label in message headers only |
| Dashboard with no topics | Still shows the project-level participant section |
| MCP join-only flow with no topics | Registers the app participant, returns no-topic project status, and leaves topic/document/message state unchanged |
| MCP install prompt join boundary | Instructs apps to stop after join + project status when no topic exists and forbids topic creation/message submission without explicit instruction |
| Dashboard UUID copy controls | Copy raw UUID and the fixed English MCP prompt for project and selected topic UUIDs |
| Participant removal | Sets status to `removed` and preserves existing message/turn/report history |
| Participant removal for current turn holder | Returns `409 Conflict` and leaves status unchanged |
| Hidden topic filtering | Excludes `deleted_at` topics from dashboard tabs, default selected-topic resolution, and default project-detail topic lists |
| Topic hiding in allowed phases | Sets `deleted_at` for `preparing`, `finalized`, and `closed` topics |
| Topic hiding in active phases | Returns `409 Conflict` for `debating`, `drafting`, `reviewing`, and `finalizing` topics |

---

## Test Commands

```bash
# All tests
pnpm test

# Targeted
pnpm test -- src/turns/

# With E2E LLM calls
LLM_SALON_E2E=1 pnpm test
```
