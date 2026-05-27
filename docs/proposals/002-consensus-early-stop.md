# Proposal 002: Consensus Early Stop

Status: Implemented
Owner: Codex
Created: 2026-05-27
Related analysis:
- Local Codex docs audit on 2026-05-27 covering endless debate after agreement

Related specs:
- `docs/specs/00-overview.md`
- `docs/specs/02-domain-model.md`
- `docs/specs/04-database.md`
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/07-llm-integration.md`
- `docs/specs/10-testing.md`

Related decision:
- `docs/decisions/ADR-002-consensus-early-stop.md`

Related worklog:
- `docs/worklogs/2026-05-27-consensus-early-stop.md`

## Summary

Add an explicit early-stop contract for `consensus` topics so the system can leave `debating` before `max_rounds` or `max_turns` when all active participants indicate that no unresolved objections remain and the report can be drafted now.

## Problem

Current specs define `consensus` only as the kind of output to produce, not as a debate-ending condition. The only normative transition out of `debating` is `max_turns OR max_rounds reached`.

That creates two failure modes:

- if `max_rounds` and `max_turns` are both `NULL`, a topic may continue indefinitely even after practical agreement
- after Proposal 001, `app` participants now correctly keep waiting and re-entering turns, which makes the lack of a stop condition more visible instead of letting the session stall accidentally

The result is meaningless additional turns where participants restate agreement, add no new information, and consume tokens without improving the report.

## Scope

- Included:
- Add a machine-readable per-message readiness signal for `consensus` debate turns.
- Define an early transition from `debating` to `drafting` when all active participants are ready.
- Update MCP, HTTP, and LLM-app guidance so clients can emit the signal intentionally.
- Add regression coverage for unanimity, reset-on-objection, and interaction with `wait_for_turn`.

- Excluded:
- Free-form server-side semantic detection of agreement from message text.
- A new moderator model that decides when the debate is over.
- Changes to `options` mode semantics.
- Human-only manual override commands such as "finish now" or "force draft now".

## Proposed Change

### 1. Add an explicit debate readiness signal

Extend debate-message submission with an optional machine-readable field:

- `debateSignal: "continue" | "ready_to_finalize"`

Rules:

- Omitted value defaults to `continue` for backward compatibility.
- The field is meaningful only for `kind = statement` during `phase = debating`.
- `feedback`, `report_draft`, `report_final`, and `system` messages do not use this field.

The signal is not inferred from the natural-language message body. Participants must state it explicitly through the API or MCP contract.

### 2. Add an early-stop rule for `consensus` topics

For topics where `mode = consensus`, the server evaluates readiness after each successful debate message.

Early transition rule:

- consider only participants with `status = active`
- read each active participant's latest debate signal from their most recent `statement` message in the current topic
- if every active participant's latest debate signal is `ready_to_finalize`, transition the topic from `debating` to `drafting` immediately

Additional rules:

- a participant with no prior `statement` message is treated as not ready
- any later `continue` signal from any active participant cancels unanimity until unanimity is re-established
- participants in `waiting`, `inactive`, or `removed` status do not block early stop

This turns consensus completion into an explicit unanimous state rather than an implicit text-classification problem.

### 3. Keep the transition atomic with message submission

If a message causes unanimity, the system must:

1. persist the message and its `debateSignal`
2. determine that unanimity is now satisfied
3. transition the topic to `drafting`
4. emit the normal topic/turn events required for waiting clients and report orchestration

This should happen in the same transaction boundary used for message submission and turn advancement so the topic cannot briefly appear to remain in `debating` after the triggering message is accepted.

### 4. Update waiting behavior for app participants

`wait_for_turn` remains the correct waiting mechanism, but the stopping condition changes:

- while the topic stays in `debating`, clients continue the current waiting loop
- if unanimity triggers early stop, waiting clients wake on `phase_changed` and stop re-entering debate turns
- after waking into `drafting` or later, clients follow the existing non-debate phase behavior instead of waiting for another debate turn

This keeps Proposal 001 intact while adding a real termination condition.

### 5. Update LLM guidance

The LLM-side contract should explicitly define when to send `ready_to_finalize`.

Recommended rule:

- use `ready_to_finalize` only when the participant believes the current discussion already contains enough material for the report and the participant has no unresolved objection that requires another debate turn
- otherwise use `continue`

The prompt guidance should also make clear that repeating agreement without adding substance is not a reason to continue debating.

## User-Visible Effects

- `consensus` topics can end before hitting the configured turn or round limit.
- Once all active participants are ready, the UI and MCP clients observe a phase change to `drafting` instead of another debate turn.
- Repetitive "I agree" turns are reduced when the models can explicitly signal completion.

## Affected Documents

- `docs/specs/00-overview.md`
  Clarify that `consensus` mode supports early exit once unanimous readiness is reached.
- `docs/specs/02-domain-model.md`
  Extend the `debating` state transition rule and define consensus early-stop semantics.
- `docs/specs/04-database.md`
  Add persistence for the per-message debate readiness signal if the design keeps it in the message record.
- `docs/specs/05-api.md`
  Extend message submission payloads and describe the early-stop effects in the response/phase behavior.
- `docs/specs/06-mcp.md`
  Extend `submit_message` input and document how clients should use the signal.
- `docs/specs/07-llm-integration.md`
  Update app guidance and system-prompt expectations around ending debate when agreement is complete.
- `docs/specs/10-testing.md`
  Add regression coverage for early stop, reset on objection, and wakeup behavior after `phase_changed`.

## Alternatives Considered

### Option A: Detect consensus from raw message text

Rejected as the primary design.

Pros:

- no extra client field required
- may appear more automatic

Cons:

- brittle across languages and prompting styles
- hard to specify precisely in docs
- difficult to test deterministically
- likely to produce premature or inconsistent endings

### Option B: Add a manual user-only "finish debate now" action

Rejected as the primary design.

Pros:

- simple to understand
- no model contract required

Cons:

- puts the human back in the loop as debate scheduler
- does not solve autonomous termination for MCP and provider participants
- easy to use inconsistently across sessions

### Option C: Require an explicit per-message readiness signal and stop on unanimity

Recommended.

Pros:

- deterministic and testable
- avoids semantic guessing from prose
- works for both `app` and `provider` participants
- preserves the server as the source of truth for phase transitions

Cons:

- requires API, MCP, and prompt contract changes
- depends on participants using the signal correctly

## Risks

- Participants may signal `ready_to_finalize` too early.
- Mitigation: require unanimity, document the signal conservatively, and treat any later `continue` as cancelling readiness.

- Older clients may never send the new field.
- Mitigation: default omitted values to `continue` and keep existing `max_rounds` / `max_turns` behavior as the fallback path.

- Mid-round late joiners with `waiting` status may not get a chance to speak before early stop.
- Mitigation: document that only `active` participants count toward unanimity and treat this as consistent with the existing "joins next round" rule.

## Acceptance Notes

Before this proposal is accepted, the repository should decide:

- whether the readiness signal is stored as a dedicated DB column/enum or derived some other durable way
- whether the signal should be exposed in human-facing status payloads or remain internal to orchestration
- whether `consensus` early stop should remain consensus-only or later be generalized to `options` topics

Before this proposal is reflected in live specs, the following should be true:

- the `debating` state machine in `docs/specs/02-domain-model.md` includes a unanimity-based early exit for `consensus`
- `submit_message` contracts in HTTP and MCP define the new field and its default
- app guidance in `docs/specs/07-llm-integration.md` tells clients when to emit `ready_to_finalize`
- tests are specified for unanimity, objection reset, backward compatibility, and `wait_for_turn` wakeup behavior

## Status History

- 2026-05-27: Draft created to address endless consensus-mode debate after practical agreement.
- 2026-05-27: Accepted and implemented with persisted `debate_signal`, HTTP/MCP submit support, provider structured output support, and consensus early-stop tests.
