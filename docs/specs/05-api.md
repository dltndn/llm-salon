# 05 — HTTP API & SSR

> Source of truth: `docs/initial-plannings/tech-spec.md` §11, §15

---

## Routes

### Page Routes (EJS SSR)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Project list page |
| `GET` | `/projects/:slug` | Project dashboard (EJS rendered) |
| `GET` | `/projects/:slug/events` | SSE stream |

### REST API

All REST routes are prefixed `/api/`. They serve as the internal interface for CLI delegation and MCP HTTP proxying.

All REST responses select `HumanDto` or `AnonymousDto` based on the `?audience=human|anonymous` query param or the calling context (MCP always forces `anonymous`).

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:slug` | Get project detail |
| `POST` | `/api/projects/:slug/topics` | Create a topic |
| `POST` | `/api/projects/:slug/participants` | Register a participant |
| `POST` | `/api/projects/:slug/topics/:topicId/messages` | Submit a message |
| `GET` | `/api/projects/:slug/topics/:topicId/context` | Get LLM context payload (`?audience=human\|anonymous`) |
| `GET` | `/api/projects/:slug/topics/:topicId/turn` | Get current turn (`?participantId=…`) |
| `GET` | `/api/projects/:slug/topics/:topicId/turn/wait` | Wait for turn or topic change (`?participantId=…&afterTopicVersion=…&timeoutMs=…`) |
| `POST` | `/api/projects/:slug/documents` | Upload a document (multipart or inline JSON) |
| `GET` | `/api/projects/:slug/topics/:topicId/report` | Get report status/content |
| `POST` | `/api/projects/:slug/close` | Close a project |

---

## Long-Poll Wait Endpoint

### `POST /api/projects/:slug/topics/:topicId/messages`

Purpose: submit a participant message for the current debate turn or reviewing feedback.

Request body:

```json
{
  "participantId": "…",
  "content": "…",
  "debateSignal": "continue"
}
```

`debateSignal` is optional and defaults to `continue`.

Allowed values:

- `continue`
- `ready_to_finalize`

Behavior:

- During `debating`, the field is stored on the `statement` message.
- For `consensus` topics, after each `debating`-phase `statement`, the server checks every active participant's latest `debateSignal`.
- A `waiting` participant that belongs to the current round must receive their first assigned turn before early stop can complete.
- If every active participant's latest signal is `ready_to_finalize`, the topic transitions to `drafting` immediately and the response returns `phaseAfter: "drafting"` with `nextMember: null`.
- For `options` topics, and for feedback/report/system messages, the field does not trigger early stop.

Response:

```json
{
  "messageId": "…",
  "nextMember": "Member B",
  "phaseAfter": "debating"
}
```

### `GET /api/projects/:slug/topics/:topicId/turn/wait`

Purpose: allow `app` participants to wait for their next actionable turn without polling `get_turn` in a tight loop.

Required query parameters:

- `participantId`

Optional query parameters:

- `afterTopicVersion`
- `timeoutMs`
- `audience=anonymous` when called from MCP

Default timeout:

- `30000` milliseconds

Behavior:

- If the participant already holds the current turn, return immediately.
- If the topic phase is already beyond the point where no further debate turn is expected for the caller, return immediately with the latest state.
- Otherwise keep the request open until one of the following happens:
  - the participant becomes the current turn holder
  - the topic version changes after `afterTopicVersion`
  - the topic phase changes
  - the project or topic reaches a closed/finalized state that should stop waiting
  - the timeout expires

Response:

```json
{
  "isMyTurn": false,
  "currentMember": "Member B",
  "phase": "debating",
  "currentRound": 2,
  "currentTurnIndex": 5,
  "serverTime": "2026-05-21T08:00:00.000Z",
  "topicVersion": 19,
  "wakeupReason": "turn_changed"
}
```

`wakeupReason` values:

- `turn_changed`
- `phase_changed`
- `topic_updated`
- `timeout`
- `closed`

Client expectation:

- Clients should treat this as a bounded long-poll.
- On `timeout`, the client should immediately call the same endpoint again unless the returned phase means no further debate turn is expected.

---

## SSE Channel

- **Endpoint:** `GET /projects/:slug/events`
- **Channel key:** `projects/<slug>` (one Subject per project)
- **Reconnection:** clients send `Last-Event-ID`; server replays the last 100 events per project.

### Event Types

| Event | Payload summary |
|---|---|
| `message.created` | `{ projectId, topicId, message: { id, displayName, content, phase, turnIndex, createdAt } }` |
| `turn.changed` | `{ projectId, topicId, currentParticipant: { id, displayName }, turnIndex, roundIndex }` |
| `participant.joined` | `{ projectId, participant: { id, displayName, status } }` |
| `topic.phase_changed` | `{ projectId, topicId, phase }` |
| `report.draft_created` | `{ projectId, topicId, reportId }` |
| `report.created` | `{ projectId, topicId, report: { id, filePath } }` |
| `project.closed` | `{ projectId }` |

> All SSE payloads shown above use `displayName` (human-facing). The SSE channel is for browser consumption only. MCP responses use `anonymous_name`.
> App participants do not consume this browser SSE stream. They wait through `/api/projects/:slug/topics/:topicId/turn/wait` via MCP.

---

## EJS Page Layout

### Project Dashboard (`/projects/:slug`)

- **Header:** project name, selected topic name, phase badge, SSE connection indicator.
- **Topic selector:** tab or dropdown in the header; selected topic reflected in `?topic=<topicId>`.
- **Left panel:** participant list (`display_name`, status, current-turn highlight).
- **Right main area:** message bubbles (chronological, auto-scroll on new message).
- **Bottom/tabs:** attached document list, report area (draft + final).

### Responsive Scope

- Target: ≥ 960 px (half a 16:9 monitor).
- Mobile/tablet: out of scope.
- Dark mode: not supported.

---

## Authentication / Access Control

- MVP: **no authentication**. Assumption: single-user local machine.
- All interfaces bind to `127.0.0.1`. External exposure is explicitly out of scope.
- Users who require external access must configure their own reverse proxy/TLS (see README warning).

---

## Error Handling

### Domain Error → HTTP Status Mapping

| Domain Error | HTTP Status |
|---|---|
| `WrongTurnError` | `409 Conflict` |
| `PhaseTransitionError` | `409 Conflict` |
| `ParticipantConflictError` | `409 Conflict` |
| `DuplicateAppRegistrationError` | `409 Conflict` |
| `MissingApiKeyError` | `400 Bad Request` |
| `DocumentTooLargeError` | `413 Payload Too Large` |
| `ProviderCallFailedError` (5xx/network) | `502 Bad Gateway` or `504 Gateway Timeout` |

A global NestJS exception filter performs the mapping. MCP error codes are defined separately in `mcp/errors.ts`.
