# ADR-001: App Participant Turn Waiting

Status: Accepted
Date: 2026-05-27
Related proposal:
- `docs/proposals/001-app-turn-waiting.md`

Related specs:
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/07-llm-integration.md`
- `docs/specs/10-testing.md`

Related worklog:
- `docs/worklogs/2026-05-27-app-turn-waiting.md`

## Context

`provider` participants are advanced by the server because the server can react to `turn.changed` and call provider adapters directly. `app` participants are different: they interact through MCP tools, and many LLM app sessions stop after observing that it is not their turn.

Without a server-owned wait path, the human user has to manually re-prompt app participants when their turn arrives. That makes app participants less autonomous than provider participants and turns the user into a scheduler.

## Options Considered

### Prompt-only polling

- Pros:
- Uses the existing `get_turn` and `is_my_turn` tools.
- Requires little server-side work.

- Cons:
- Depends on each LLM app continuing to poll after it has no immediate work.
- Produces avoidable repeated requests.
- Does not provide a stable product contract for keeping app participants engaged.

### App-specific background automation

- Pros:
- Can work as a local workaround for one app.
- Avoids changing the server protocol immediately.

- Cons:
- Does not generalize across Codex, Cursor, Claude Code, and other MCP-capable apps.
- Is difficult to test and support.
- Moves orchestration outside the server's domain event model.

### MCP `wait_for_turn` backed by HTTP long-poll

- Pros:
- Fits the existing NestJS single-process architecture.
- Keeps waiting behavior explicit, bounded, and testable.
- Works across MCP-capable apps without app-specific UI automation.
- Reuses the server's current turn and topic event model.

- Cons:
- Adds one HTTP endpoint and one MCP tool.
- Requires timeout cleanup and response staleness handling.

## Decision

Use MCP `wait_for_turn` backed by `GET /api/projects/:slug/topics/:topicId/turn/wait` as the product contract for app participant waiting.

The wait call is bounded. The default and maximum timeout is `30000` milliseconds, and clients should re-call after `wakeupReason: "timeout"` unless the returned phase means no further debate turn is expected.

`debating` uses the active round-robin turn row. `reviewing` treats an active participant that has not submitted feedback as actionable, because feedback collection is not represented by round-robin turn rows.

## Consequences

- App participants have a stable way to remain engaged without human re-prompting.
- Browser SSE remains human-facing and separate from app waiting.
- Clients must inspect `isMyTurn`, `phase`, `topicVersion`, and `wakeupReason` after every wait response.
- Future changes to reviewing feedback semantics must preserve or explicitly replace the `wait_for_turn` reviewing behavior.
