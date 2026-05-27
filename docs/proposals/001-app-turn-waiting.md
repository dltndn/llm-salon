# Proposal 001: App Participant Turn Waiting

Status: Implemented
Owner: Codex
Created: 2026-05-21
Related analysis:
- Conversation analysis in the local Codex thread on 2026-05-21

Related specs:
- `docs/specs/01-architecture.md`
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/07-llm-integration.md`
- `docs/specs/10-testing.md`

Related decision:
- `docs/decisions/ADR-001-app-turn-waiting.md`

Related worklog:
- `docs/worklogs/2026-05-27-app-turn-waiting.md`

## Summary

Adopt a server-driven waiting flow for `app` participants by adding an MCP `wait_for_turn` tool backed by an HTTP long-poll endpoint. This becomes the primary mechanism for app participants to remain available until their turn arrives, instead of depending on manual user nudges, prompt-only polling loops, or app-specific background automation.

## Problem

Today, `provider` participants can speak automatically because the server reacts to `turn.changed` events and triggers the provider adapter path directly. `app` participants do not have an equivalent server-driven wakeup path.

Current app behavior depends on the LLM app continuing to poll MCP tools on its own. In practice, many LLM apps stop work after confirming that it is not their turn. This leaves the discussion stalled until the human user manually prompts the agent again when its turn arrives.

That creates three problems:

- turn progression for app participants is not autonomous
- the user must act as a manual scheduler between turns
- the product behavior is inconsistent between `provider` and `app` participants

## Scope

- Included:
- Add an HTTP long-poll endpoint for waiting on turn changes.
- Add an MCP `wait_for_turn` tool that wraps the HTTP wait endpoint.
- Define timeout and retry expectations for app participants.
- Define the expected client loop for app participants during debate.
- Add test requirements for long-poll wakeup behavior.

- Excluded:
- Browser SSE changes for human dashboards.
- App-specific GUI automation or injected background scripts.
- Cross-app push integration beyond MCP and HTTP.
- Daemonizing the server or changing the single-process model.

## Proposed Change

### 1. Add an HTTP long-poll endpoint

Add a new internal API endpoint for waiting on topic turn changes:

`GET /api/projects/:slug/topics/:topicId/turn/wait`

Required query parameters:

- `participantId`

Optional query parameters:

- `afterTopicVersion`
- `timeoutMs`

Behavior:

- If the participant currently holds the turn, return immediately.
- If the topic phase is no longer one in which the participant should wait, return immediately with the latest state.
- Otherwise, hold the request open until one of the following occurs:
- the participant becomes the current turn holder
- the topic version changes
- the topic phase changes
- the project or topic becomes closed/finalized for practical purposes
- the timeout expires

Response shape:

- `isMyTurn`
- `currentMember`
- `phase`
- `currentRound`
- `currentTurnIndex`
- `serverTime`
- `topicVersion`
- `wakeupReason`

`wakeupReason` values:

- `turn_changed`
- `phase_changed`
- `topic_updated`
- `timeout`
- `closed`

### 2. Add an MCP `wait_for_turn` tool

Add a new MCP tool:

`wait_for_turn(projectId, topicId, participantId, afterTopicVersion?, timeoutMs?)`

Behavior:

- Delegate to the HTTP long-poll endpoint.
- Preserve the anonymous response contract used by existing MCP tools.
- Return immediately when the caller already has the turn.
- Otherwise block until wakeup or timeout.

This tool becomes the preferred waiting mechanism for `app` participants.

### 3. Adopt finite waiting with client re-call

The server must not keep requests open forever. The default behavior is:

- default timeout: `30000` milliseconds
- client behavior after timeout: immediately call `wait_for_turn` again unless the phase indicates no further debate turn is expected

This creates a bounded long-poll loop instead of an infinite hanging request. The loop improves recovery after client disconnects, MCP process restarts, or transient transport failures.

### 4. Define the app participant operating loop

App participants should follow this loop:

1. Join the project and topic context as today.
2. Call `is_my_turn` or `get_turn` once for initial state.
3. If it is not the participant's turn, call `wait_for_turn`.
4. If `wait_for_turn` returns `isMyTurn: true`, generate the debate response and call `submit_message`.
5. After submission, call `wait_for_turn` again for the next turn unless the phase has advanced beyond debating.

This proposal intentionally shifts the waiting contract from prompt-only polling guidance to a concrete MCP capability.

### 5. Keep browser SSE separate

The existing browser SSE channel remains human-facing and unchanged. This proposal does not repurpose the SSE payloads for MCP clients because the current spec explicitly defines that stream for browser consumption and human-facing display names.

### 6. Do not make background JS automation part of the product contract

Running custom JavaScript or UI automation in the background to keep a specific LLM app session alive may help for local experimentation, but it should not be the product-level solution.

Reasons:

- it is app-specific and brittle
- it does not generalize across Codex, Cursor, Claude Code, and other MCP-capable apps
- it introduces a second orchestration layer outside the server's source of truth
- it is harder to test and document than a server-owned wait contract

## User-Visible Effects

- App participants can stay engaged in a debate without the user manually re-prompting them each turn.
- Debate behavior becomes more consistent between app participants and provider participants.
- Temporary waiting becomes an explicit, documented part of the MCP workflow.

## Affected Documents

- `docs/specs/01-architecture.md`
  Add the HTTP long-poll wait path to the system interaction model.
- `docs/specs/05-api.md`
  Add the new wait endpoint and response contract.
- `docs/specs/06-mcp.md`
  Add the `wait_for_turn` tool and define its return shape and usage expectations.
- `docs/specs/07-llm-integration.md`
  Update app-participant operating guidance so "not my turn" leads to waiting, not silent termination.
- `docs/specs/10-testing.md`
  Add regression coverage for immediate return, wakeup on turn change, and timeout/re-call behavior.

Optional follow-up documents:

- `docs/decisions/ADR-001-app-turn-waiting.md`
- `docs/worklogs/2026-05-21-app-turn-waiting.md`

## Alternatives Considered

### Option A: Prompt-only polling by all app participants

Rejected as the primary design.

Pros:

- minimal server changes
- compatible with existing MCP tools

Cons:

- depends on each app continuing a polling loop voluntarily
- many LLM apps terminate work when told it is not their turn
- increases request churn compared with event-backed waiting
- leaves operational behavior under-specified

### Option B: Background JavaScript or app automation to keep sessions alive

Rejected as the product design.

Pros:

- can work as a local workaround for a specific app
- may avoid immediate server changes

Cons:

- brittle and app-specific
- not portable across supported LLM apps
- difficult to verify and support
- moves control away from the server event model

### Option C: MCP `wait_for_turn` backed by HTTP long-poll

Accepted.

Pros:

- fits the current single-server architecture
- works across MCP-capable apps without app-specific automation
- keeps waiting behavior explicit and testable
- aligns app participants more closely with provider auto-speak behavior

Cons:

- adds one new API surface and one new MCP tool
- requires careful timeout and cleanup handling

## Risks

- Long-poll requests may accumulate if clients are buggy.
- Mitigation: use a finite default timeout and require client re-call.

- App clients may still ignore the recommended loop.
- Mitigation: document `wait_for_turn` as the preferred contract in MCP and app guidance.

- The server may wake clients for non-turn topic updates that do not require speaking.
- Mitigation: include `wakeupReason`, `isMyTurn`, and `topicVersion` so the client can decide the next action safely.

## Acceptance Notes

Before this proposal is reflected in live specs, the following should be true:

- the wait endpoint contract is defined in `docs/specs/05-api.md`
- the MCP tool contract is defined in `docs/specs/06-mcp.md`
- the app waiting loop is reflected in `docs/specs/07-llm-integration.md`
- tests are specified in `docs/specs/10-testing.md`
- the default timeout is documented as `30000` milliseconds

## Status History

- 2026-05-21: Accepted proposal created with `wait_for_turn` as the recommended design.
- 2026-05-27: Implemented HTTP long-poll and MCP `wait_for_turn` support.
