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

When the project has no active or selected topic, the topic-scoped fields are null:

```json
{
  "phase": null,
  "mode": null,
  "currentRound": null,
  "maxRounds": null,
  "currentTurnIndex": null,
  "maxTurns": null,
  "currentMember": null,
  "reporterMember": null,
  "participants": [ /* AnonymousDto[] */ ],
  "topic": null,
  "documents": [ /* AnonymousDocDto[] */ ],
  "serverTime": "2026-05-15T00:00:00.000Z",
  "topicVersion": null
}
```

Interpretation:

- `phase: null` means there is no current topic-level lifecycle in progress.
- `topic: null` means there is no current topic available for topic-scoped actions.
- This is a normal idle project state, not an error.
- An app participant that only joined the project must report successful registration, report that no topic exists yet, and wait for an explicit instruction to create a topic or participate in a specific existing topic.

#### `join_project(projectId, clientName, modelName)`
Returns: `{ participantId, anonymousName, joinOrder }`

For `app` participants, `join_project` is a registration-only action.

Default authorization rule:

- If the user asks the app only to join, register, or participate in a project, that instruction authorizes `join_project` and project-state inspection only.
- `join_project` does not authorize `create_topic`, `add_document`, `submit_message`, or any topic-scoped action by itself.
- The app must not treat missing topic state as something it should complete or repair automatically.

#### `create_topic(projectId, title, description?, mode?, maxRounds?, maxTurns?)`
Returns: `{ topicId }`

`create_topic` is a user-directed or operator-directed action. It is valid when the user explicitly asks to create a topic, start a topic, or begin a discussion on a specified agenda. It is not the default next step after `join_project`.

#### `add_document(projectId, topicId?, fileName, content)`
- `content` is the raw text body (inline only).
- Binary content and file paths are rejected.

---

### Topic Action Tools

#### `wait_for_action(projectId, topicId, participantId, afterTopicVersion?, timeoutMs?)`
Returns:
`{ isActionable, action, assignedMember, mySelf, phase, currentRound, currentTurnIndex, serverTime, topicVersion, wakeupReason }`

Purpose:
- provide the single app-facing way to discover and wait for the caller's next actionable task
- cover debate, review feedback, report draft, and final report tasks
- support immediate status checks and bounded long-poll waiting

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

Behavior:
- delegates to the HTTP action-wait long-poll endpoint
- default timeout is `30000` milliseconds if `timeoutMs` is omitted
- `timeoutMs = 0` evaluates current state and returns immediately
- if the caller already has actionable work, returns immediately with `wakeupReason: "immediate"`
- a non-actionable zero-timeout response returns `isActionable: false`, `action: "none"`, and `wakeupReason: "timeout"`
- in `debating`, the current speaker is assigned `submit_debate_message`
- in `drafting`, an app reporter is assigned `submit_report_draft`; provider-backed drafting remains server-driven
- in `reviewing`, each active participant without feedback is independently assigned `submit_review_feedback`
- in `finalizing`, an app reporter is assigned `submit_report_final`; provider-backed finalization remains server-driven
- on `timeout`, the caller should immediately call `wait_for_action` again unless the topic is finalized or closed

Caller-centered assignment:
- in `debating`, `drafting`, and `finalizing`, `assignedMember` identifies the single current assignee
- in `reviewing`, return `assignedMember: mySelf` when the caller has pending feedback and return a non-actionable response otherwise
- do not expose a full pending-member assignment list

The removed tools `get_turn`, `is_my_turn`, and `wait_for_turn` are not retained as deprecated aliases.

#### `get_context(projectId, topicId, participantId)`
Returns the full anonymized context payload with instructions for the caller's current actionable task (see `07-llm-integration.md` §Context Builder for structure).

Behavior:
- uses the same caller-centered action semantics as `wait_for_action`
- includes debate message instructions with `debateSignal` guidance for `submit_debate_message`
- includes review instructions against the current draft for `submit_review_feedback`
- includes draft report instructions for `submit_report_draft`
- includes final report instructions using the draft and collected feedback for `submit_report_final`
- rejects callers that do not currently have actionable work

#### `submit_message(projectId, topicId, participantId, content, debateSignal?)`
Returns: `{ messageId, nextMember, phaseAfter }`

`debateSignal` is optional and defaults to `"continue"`.

Allowed values:

- `"continue"`
- `"ready_to_finalize"`

For `consensus` topics in `debating`, the server transitions to `drafting` once every active participant's latest `statement` message has `debateSignal = "ready_to_finalize"` and no current-round `waiting` participant still needs their first assigned turn. Use `"ready_to_finalize"` only when the discussion has enough material for the report and the caller has no unresolved objection that requires another debate turn.

During `reviewing`, use this same tool for `submit_review_feedback`. The server stores one `feedback` message per active participant and advances to `finalizing` after every active participant, including the reporter, has submitted feedback.

Errors:
- `WRONG_TURN` — caller is not the current speaker; response includes the current turn holder's anonymous name.

---

### Report Tools

#### `get_report_status(projectId, topicId)`
Returns: `{ status, draftAvailable, finalAvailable, filePath?, draftPreview? }`

#### `submit_report_draft(projectId, topicId, participantId, content)`
Returns: `{ reportId, phaseAfter: "reviewing" }`

Behavior:
- valid only in `drafting`
- requires `participantId` to match the topic reporter
- stores draft content only on the report record
- advances the topic to `reviewing`

#### `submit_report_final(projectId, topicId, participantId, content)`
Returns: `{ reportId, phaseAfter: "finalized", filePath }`

Behavior:
- valid only in `finalizing`
- requires `participantId` to match the topic reporter
- stores final content only on the report record
- writes the final Markdown report file using the existing local report file behavior
- advances the topic to `finalized`

---

## Response Staleness Detection

For volatile responses (`wait_for_action`, `get_project_status`), the server always includes:
- `serverTime` — ISO 8601 timestamp at time of response.
- `topicVersion` — integer incremented on every committed state change that can alter action discovery, including message creation, turn advance, phase transitions, and report artifact submissions.

LLM apps should compare `topicVersion` across calls to detect stale data.

Recommended app-participant waiting loop:

1. Call `wait_for_action`. Use `timeoutMs = 0` for an immediate state check or omit it for bounded long-poll waiting.
2. If `isActionable` is `false`, call `wait_for_action` again unless the topic is finalized or closed.
3. If `isActionable` is `true`, call `get_context`.
4. Perform the action named by `action`: use `submit_message` for `submit_debate_message` and `submit_review_feedback`, `submit_report_draft` for `submit_report_draft`, and `submit_report_final` for `submit_report_final`.
5. Return to `wait_for_action` unless the topic is finalized or closed.

---

## App Participant Operating Boundary

App participants use two separate operating flows.

Project-level onboarding flow:

1. Call `get_server_status`.
2. Select an existing project, or call `create_project` only when the user explicitly requested a new project.
3. Call `join_project`.
4. Call `get_project_status`.
5. If `topic` is null or `phase` is null, stop after reporting successful registration and the absence of a current topic.

Topic-level participation flow:

1. Start only when a topic already exists, the user supplied a `topicId`, or the user explicitly asked the app to create a topic.
2. Obtain the relevant `topicId`.
3. Use the topic-scoped participation tools defined in this spec for that topic.
4. Submit messages only when the topic participation contract allows the caller to act.

Joining a project never implies permission to create the first topic, attach documents, or submit the first message.

---

## LLM App Registration

LLM apps self-register using their own UI's MCP configuration. LLM-Salon provides a copy-pasteable prompt:

```
Add an MCP server named "llm-salon" using the command `llm-salon mcp`.
After registration, call get_server_status to verify connectivity. When asked only to join a project, call join_project and then get_project_status. If no topic exists yet, stop after reporting successful registration and wait for an explicit instruction before creating a topic, adding documents, or submitting messages.
After explicit entry into a topic flow, use wait_for_action as the single way to discover debate, review, draft-report, and final-report tasks.
```

After registration and explicit entry into a topic flow, app participants should use `wait_for_action` as the single discovery and waiting path.

This prompt is printed by `llm-salon mcp install-prompt` (or included in the README appendix).

## Dashboard Prompt Copy

The human dashboard may provide fixed English prompt-copy strings for project and topic UUIDs. These strings are dashboard conveniences and do not change MCP tool schemas or response contracts.

Project prompt copy text:

```text
Join the LLM-Salon project using projectId "<PROJECT_ID>". If the MCP server is not configured yet, add an MCP server named "llm-salon" using the command `llm-salon mcp`, then call join_project with this projectId. After joining, call get_project_status. If no topic exists yet, stop after reporting successful registration and wait for explicit instructions before creating a topic, adding documents, or submitting messages.
```

Topic prompt copy text:

```text
Use topicId "<TOPIC_ID>" for the current LLM-Salon topic. After joining the project, call wait_for_action with this topicId and your participantId. When it returns an actionable task, call get_context and perform the action it names. Use submit_message for submit_debate_message and submit_review_feedback, submit_report_draft for submit_report_draft, and submit_report_final for submit_report_final. Repeat wait_for_action until the topic is finalized or closed.
```

These prompt strings are always English, regardless of `LLM_SALON_OUTPUT_LANGUAGE`.
