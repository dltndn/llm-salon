# ADR-002: Consensus Early Stop

Status: Accepted
Date: 2026-05-27
Related proposal:
- `docs/proposals/002-consensus-early-stop.md`

Related specs:
- `docs/specs/00-overview.md`
- `docs/specs/02-domain-model.md`
- `docs/specs/04-database.md`
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/07-llm-integration.md`
- `docs/specs/10-testing.md`

Related worklog:
- `docs/worklogs/2026-05-27-consensus-early-stop.md`

## Context

`consensus` mode previously described the expected output shape but did not define a consensus-based transition out of `debating`. Topics could only enter `drafting` when `max_turns` or `max_rounds` was reached. With app participants now using `wait_for_turn`, participants can keep taking turns after practical agreement and waste tokens restating the same position.

The system needs an explicit, testable way to stop debate once all active participants agree that the discussion is ready for report drafting.

## Options Considered

### Infer agreement from message text

- Pros:
- No new API field.
- Appears automatic to participants.

- Cons:
- Ambiguous across languages and debate styles.
- Hard to specify as a deterministic product rule.
- Risks premature or inconsistent phase changes.

### Add a manual user finish action

- Pros:
- Simple to understand.
- Avoids changing LLM message contracts.

- Cons:
- Makes the user responsible for scheduling the end of debate.
- Does not solve autonomous provider and MCP participant flows.
- Adds a separate control path outside the existing turn lifecycle.

### Require explicit per-message readiness

- Pros:
- Deterministic and testable.
- Works through the same message submission path used by all participants.
- Keeps phase transitions server-owned.
- Preserves existing max turn and max round limits as fallback behavior.

- Cons:
- Requires API, MCP, prompt, and database changes.
- Older clients default to `continue` and therefore cannot trigger early stop.

## Decision

Use a persisted `debate_signal` value on each message. The allowed values are `continue` and `ready_to_finalize`, and omitted values default to `continue`.

For `consensus` topics, after each successful `debating`-phase `statement`, the server checks every active participant's latest `debate_signal` from their `debating` statements. If all active participants are `ready_to_finalize`, the topic immediately transitions from `debating` to `drafting`.

The rule does not apply to `options` topics. Participants with `waiting`, `inactive`, or `removed` status do not block early stop.

Provider auto-speak asks models for structured `{ content, debateSignal }` output. Plain-text provider output remains accepted and is submitted with `continue` for compatibility.

## Consequences

- Consensus topics can finish before exhausting round or turn limits.
- App clients must pass `debateSignal` to `submit_message` when they can decide readiness.
- Provider models can participate in early stop when they return valid structured output.
- Existing clients remain compatible but continue to rely on `max_rounds` or `max_turns` unless updated.
