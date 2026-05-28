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

### Context Profile Policy (`llm/context-policy.ts`)
- For each profile (`low`, `medium`, `high`): verify token budget calculation, per-file size limit, per-project size limit.
- Verify fallback to `medium` on invalid/missing profile value.

---

## Integration Tests

### REST + SSE (Supertest)
- Project creation → topic creation → participant registration → message submission flow.
- SSE event delivery after message submission.
- `409` response when a non-current participant attempts to submit.
- Long-poll wait endpoint returns immediately when the caller already has the turn.
- Long-poll wait endpoint wakes on turn change and returns updated `topicVersion` plus `wakeupReason`.
- Long-poll wait endpoint times out cleanly and supports client re-call behavior.

### Database (Prisma)
- Use `testcontainers` or a local PostgreSQL temporary schema.
- Transaction atomicity: verify that a message insert failure rolls back the turn advance.

### MCP (stdio)
- Spawn the `llm-salon mcp` child process and run JSON-RPC message round-trips.
- Verify tool response anonymization: no human-facing fields in any tool response.
- Verify `wait_for_turn` blocks until wakeup or timeout and preserves the anonymous response contract.

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
| `is_my_turn` for the current turn holder | Returns `{ isMyTurn: true }` |
| `is_my_turn` for a non-current participant | Returns `{ isMyTurn: false }` |
| `wait_for_turn` when the caller already has the turn | Returns immediately with `isMyTurn: true` |
| `wait_for_turn` after another participant submits a message | Returns with updated `topicVersion` and `wakeupReason: "turn_changed"` |
| `wait_for_turn` timeout with no turn change | Returns `wakeupReason: "timeout"` and can be called again safely |
| `submit_message` with wrong participant | Returns `WRONG_TURN` error with current member's anonymous name |
| `submit_message` with unanimous consensus readiness | Returns `{ nextMember: null, phaseAfter: "drafting" }` |
| `submit_message` with a current-round waiting participant | Returns the waiting participant as `nextMember` and promotes them to `active` before consensus early stop can complete |
| Document upload exceeding profile limit | Returns `413` with descriptive message |

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
