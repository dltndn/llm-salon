# 06 — MCP / stdio Interface

> Source of truth: `docs/initial-plannings/tech-spec.md` §10

---

## Transport

- SDK: `@modelcontextprotocol/sdk` (TypeScript), stdio transport.
- `llm-salon mcp` spawns a child process that exposes the MCP stdio server.
- The child process delegates all calls to the running HTTP server. If the server is not running, it returns a clear error message.

---

## Anonymization Contract

All MCP tool responses are filtered through the `AnonymousDto` interceptor defined in `mcp/`.

- `display_name`, `provider_name`, `model_name`, `client_name` **must never appear** in any MCP response.
- Only `anonymous_name` (`Member A`, `Member B`, …) is used to identify participants.
- Violation causes an immediate `throw` inside the interceptor (not a silent omission).

---

## Tools

All tool input/output schemas are defined as JSON Schema objects.

### Project / Session Tools

#### `create_project(name)`
Returns: `{ projectId, slug, url }`

#### `get_server_status()`
Returns: `{ version, projects: [{ projectId, slug, name, phase, status }], host: "127.0.0.1", port }`

Allows LLM apps to discover which projects the server is currently hosting.

#### `get_project_status(projectIdOrSlug)`
Returns:
```json
{
  "phase": "debating",
  "mode": "consensus",
  "currentRound": 1,
  "maxRounds": 5,
  "currentTurnIndex": 3,
  "maxTurns": null,
  "currentMember": "Member B",
  "reporterMember": null,
  "participants": [ /* AnonymousDto[] */ ],
  "topic": { "title": "…", "mode": "consensus" },
  "documents": [ /* AnonymousDocDto[] */ ],
  "serverTime": "2026-05-15T00:00:00.000Z",
  "topicVersion": 12
}
```

#### `join_project(projectId, clientName, modelName)`
Returns: `{ participantId, anonymousName, joinOrder }`

#### `create_topic(projectId, title, description?, mode?, maxRounds?, maxTurns?)`
Returns: `{ topicId }`

#### `add_document(projectId, topicId?, fileName, content)`
- `content` is the raw text body (inline only).
- Binary content and file paths are rejected.

---

### Debate Tools

#### `get_context(projectId, topicId)`
Returns the full anonymized context payload (see `07-llm-integration.md` §Context Builder for structure).

#### `get_turn(projectId, topicId, participantId?)`
Returns: `{ currentMember, phase, currentRound, currentTurnIndex, serverTime, topicVersion }`

If `participantId` is provided, also returns: `{ isMyTurn: boolean, mySelf: "Member X" }`

#### `is_my_turn(projectId, topicId, participantId)`
Returns: `{ isMyTurn: boolean, currentMember, phase, serverTime, topicVersion }`

Convenience tool for LLM apps to check eligibility without parsing the full turn object.

#### `wait_for_turn(projectId, topicId, participantId, afterTopicVersion?, timeoutMs?)`
Returns:
`{ isMyTurn, currentMember, phase, currentRound, currentTurnIndex, serverTime, topicVersion, wakeupReason }`

Purpose:
- provide the preferred waiting mechanism for `app` participants
- avoid tight polling loops on `get_turn`
- keep the MCP session alive through a bounded blocking call

Behavior:
- if the caller already has the turn, returns immediately
- otherwise delegates to the HTTP long-poll wait endpoint
- default timeout is `30000` milliseconds if `timeoutMs` is omitted
- on `timeout`, the caller should immediately call `wait_for_turn` again unless the returned phase indicates no further debate turn is expected

#### `submit_message(projectId, topicId, participantId, content, debateSignal?)`
Returns: `{ messageId, nextMember, phaseAfter }`

`debateSignal` is optional and defaults to `"continue"`.

Allowed values:

- `"continue"`
- `"ready_to_finalize"`

For `consensus` topics in `debating`, the server transitions to `drafting` once every active participant's latest `statement` message has `debateSignal = "ready_to_finalize"` and no current-round `waiting` participant still needs their first assigned turn. Use `"ready_to_finalize"` only when the discussion has enough material for the report and the caller has no unresolved objection that requires another debate turn.

Errors:
- `WRONG_TURN` — caller is not the current speaker; response includes the current turn holder's anonymous name.

---

### Report Tools

#### `get_report_status(projectId, topicId)`
Returns: `{ status, draftAvailable, finalAvailable, filePath?, draftPreview? }`

---

## Response Staleness Detection

For volatile responses (`is_my_turn`, `get_turn`, `wait_for_turn`, `get_project_status`), the server always includes:
- `serverTime` — ISO 8601 timestamp at time of response.
- `topicVersion` — integer incremented on every message or turn change.

LLM apps should compare `topicVersion` across calls to detect stale data.

Recommended app-participant waiting loop:

1. Call `is_my_turn` or `get_turn` for initial state.
2. If `isMyTurn` is `false`, call `wait_for_turn`.
3. When `wait_for_turn` returns `isMyTurn: true`, generate the response and call `submit_message` with `debateSignal`.
4. After submission, return to `wait_for_turn` unless the phase has advanced beyond debate turn-taking.

---

## LLM App Registration

LLM apps self-register using their own UI's MCP configuration. LLM-Salon provides a copy-pasteable prompt:

```
Add an MCP server named "llm-salon" using the command `llm-salon mcp`.
After registration, call get_server_status to verify connectivity.
```

After registration, app participants should use `wait_for_turn` as the default non-turn waiting path during debate turns instead of repeatedly polling `get_turn`.

This prompt is printed by `llm-salon mcp install-prompt` (or included in the README appendix).

## Dashboard Prompt Copy

The human dashboard may provide fixed English prompt-copy strings for project and topic UUIDs. These strings are dashboard conveniences and do not change MCP tool schemas or response contracts.

Project prompt copy text:

```text
Join the LLM-Salon project using projectId "<PROJECT_ID>". If the MCP server is not configured yet, add an MCP server named "llm-salon" using the command `llm-salon mcp`, then call join_project with this projectId.
```

Topic prompt copy text:

```text
Use topicId "<TOPIC_ID>" for the current LLM-Salon topic. After joining the project, call get_turn and wait_for_turn with this topicId, and submit messages with submit_message when it is your turn.
```

These prompt strings are always English, regardless of `LLM_SALON_OUTPUT_LANGUAGE`.
