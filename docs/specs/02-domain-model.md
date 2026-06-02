# 02 — Domain Model

> Source of truth: `docs/initial-plannings/tech-spec.md` §5–7; `docs/initial-plannings/prd.md` §5–6, §15

---

## Entities and Relationships

```
Project
  ├─ has many Topics
  ├─ has many Participants
  └─ has many Documents (project-level)

Topic
  ├─ belongs to Project
  ├─ has many Messages
  ├─ has many Turns
  ├─ has many Documents (topic-level)
  └─ has one Report
```

---

## ENUMs

All ENUMs are defined as PostgreSQL ENUM types and mapped in Prisma.

### `participant_type`
- `app` — LLM app participant (joins via MCP/stdio)
- `provider` — API Provider participant (called directly by the server)

### `participant_status`
- `active` — registered, inserted into the actual turn rotation, and counted by active-only rules
- `waiting` — registered but not yet inserted into the actual turn rotation
- `inactive` — temporarily excluded from turns
- `removed` — permanently removed; name is retained to prevent reuse

### `project_status`
- `created` → `active` → `drafting` → `reviewing` → `finalized` → `closed`

### `topic_phase`
- `preparing` → `debating` → `drafting` → `reviewing` → `finalizing` → `finalized` → `closed`

### `topic_mode`
- `consensus` — produce a single agreed-upon output
- `options` — present multiple alternatives to the user

### `turn_status`
- `idle` — turn created, not yet started
- `in_progress` — the assigned participant is expected to submit now
- `completed` — message was submitted
- `skipped` — participant was inactive/removed; turn auto-advanced

### `report_status`
- `none` → `drafting` → `draft_ready` → `reviewing` → `finalizing` → `finalized`

### `message_kind`
- `statement` — regular debate turn
- `feedback` — reviewing-phase feedback on a draft
- `report_draft` — reserved legacy enum value; report draft body content is stored on the report record
- `report_final` — reserved legacy enum value; final report body content is stored on the report record
- `system` — system-generated notice

### `debate_signal`
- `continue` — the participant believes another debate turn may still be needed
- `ready_to_finalize` — the participant believes the current discussion has enough material for the report and they have no unresolved objection requiring another debate turn

---

## Core Business Rules

### Anonymous Name Assignment

- On participant registration, a transaction reads `MAX(join_order)` from the `participants` table scoped to the project.
- Names are assigned as `Member A`, `Member B`, … `Member Z`, then `Member AA`, `Member AB`, etc.
- `removed` participants are still counted (no name reuse).
- Anonymous names are immutable after assignment.

### Round-Robin Turn Order

- **Candidates:** participants with `status = active` or `waiting`.
- **Sort key:** `join_order` ascending.
- **Next speaker algorithm:**
  1. Find the `join_order` of `current_participant_id` in the current turn.
  2. Select the lowest `join_order` greater than the current one among candidates.
  3. If none exists: increment `round_index` and select the lowest `join_order` overall.
- Inactive/removed participants are auto-skipped; their turn row is recorded with `status = skipped`.
- **New participants join from the next round.** Mid-round arrivals are not inserted into the current round's rotation.
- When the system creates a participant's first assigned `turn` row and that participant is still `waiting`, the participant is promoted to `active` in the same DB transaction.
- The automatic promotion is one-way. Participants do not move back from `active` to `waiting`; `inactive` or `removed` are used when participation must stop.

### Participant Removal

- Human-facing participant removal is a lifecycle transition to `status = removed`.
- Removal never deletes participant rows, messages, turns, reports, documents, or anonymous-name history.
- Removed participants are excluded from future turn-taking and active-only rules under the same semantics as other `removed` participants.
- Removed participants remain counted for anonymous-name non-reuse and uniqueness history.
- The current `in_progress` turn holder cannot be removed. The request must be rejected with `409 Conflict`.

### Topic Phase State Machine

All transitions are performed automatically by the system (no manual `force_*` triggers in MVP).
Each transition executes in a single DB transaction and emits a domain event immediately after commit.

```
preparing ──[first message submitted]──────────────────────► debating
debating  ──[max_turns OR max_rounds reached]──────────────► drafting
debating  ──[consensus readiness reached]──────────────────► drafting
drafting  ──[draft report saved]───────────────────────────► reviewing
reviewing ──[all active participants gave feedback once]───► finalizing
finalizing──[final report file saved]──────────────────────► finalized
finalized ──[user explicitly closes]───────────────────────► closed
```

Forbidden transitions (any other path) must raise `PhaseTransitionError`.

### Reporter Ownership and Report Production

- The reporter relationship means the participant that owns report production for the topic. The reporter may be a `provider` participant or an `app` participant.
- When a topic enters `drafting`, active providers are preferred. If at least one active provider exists, preserve the server-driven provider report pipeline.
- When a topic leaves debate with no active provider, the current turn holder becomes the app reporter. This applies whether debate ended through consensus readiness or configured round/turn limits. Store that participant in both `topics.reporter_participant_id` and `reports.reporter_participant_id`.
- Validate report row creation or reuse before committing the phase transition. Preserve the one-report-per-topic safeguard.
- The final debate message remains a `statement`. It is not reused as the report draft.
- The same reporter owns both draft and final report production.
- An app reporter submits draft and final content explicitly. The task remains open across wait timeouts and is not automatically reassigned.
- Report draft and final content live only on the report record. Do not duplicate report body content as topic messages.

### Reviewing Feedback

- Reviewing feedback remains message-like participant input and uses the existing message submission path.
- Every active participant, including the reporter, submits feedback once.
- When every active participant has submitted feedback, the topic advances to `finalizing`.

### Topic Visibility

- A topic with `deleted_at IS NOT NULL` is hidden from normal human-facing dashboard and default project-detail flows.
- Hidden topics preserve all stored records, including messages, turns, documents, and reports.
- Topic hiding is allowed only when `phase` is `preparing`, `finalized`, or `closed`.
- Topic hiding is rejected when `phase` is `debating`, `drafting`, `reviewing`, or `finalizing`.
- Topic hiding is a visibility change, not a topic phase transition, and it does not add a dashboard restore path.

### Consensus Early Stop

For `mode = consensus`, the system evaluates early-stop readiness after each successful `statement` message in `debating`.

- Only participants with `status = active` are counted.
- Each active participant's latest `statement` message in the topic with `phase = debating` supplies that participant's current `debate_signal`.
- A participant with no `debating`-phase `statement` is treated as not ready.
- A `waiting` participant that was already part of the current round when the round began blocks early stop until their first assigned turn is created.
- If every active participant's latest signal is `ready_to_finalize`, the topic transitions from `debating` to `drafting` immediately.
- Any later `continue` signal from an active participant cancels readiness until unanimity is reached again.
- Mid-round `waiting` arrivals, `inactive` participants, and `removed` participants do not block consensus early stop.
- `options` topics do not use this early-stop rule.

### Participant Registration Constraints

- `drafting` phase and beyond: new participant registration is rejected.
- `debating` phase: mid-round join is allowed; participant enters next round.
- Unique constraints (per project):
  - `anonymous_name` (global)
  - `(client_name, model_name)` for `app` type where `status <> removed`
  - `(provider_name, model_name)` for `provider` type where `status <> removed`

### Concurrency Control

- "Submit message → advance turn → emit event" is protected by a single DB transaction + row-level lock.
- `SELECT … FOR UPDATE` on the `turns` row before validation and update.
- Concurrent calls from MCP and HTTP result in the later call receiving `409 Conflict`.
- Report artifact submission validates reporter ownership and phase inside the transaction before persisting content and advancing the topic.

---

## Domain Events

Emitted via NestJS `EventEmitter2`. All events are subscribed by two handlers:

1. **SSE broadcaster** — multiplexes into a per-project RxJS `Subject`.
2. **Persistence post-processor** — handles file writes and similar side effects.

| Event | Trigger |
|---|---|
| `message.created` | Message stored in DB |
| `turn.changed` | Turn advanced to next participant |
| `participant.joined` | New participant registered |
| `topic.phase_changed` | Phase transition completed |
| `report.draft_created` | Draft report saved |
| `report.created` | Final report file written |
| `project.closed` | Project moved to `closed` |

---

## Anonymization Policy

### Two Serialization Paths

Every domain object has two DTO forms:

- **`*HumanDto`** — includes `display_name`, `provider_name`, `model_name`, `client_name`. Used only in web UI and CLI output.
- **`*AnonymousDto`** — includes `anonymous_name` only. Used in all LLM-facing payloads (MCP responses, LLM prompt context, SSE payloads for LLM apps).

### Enforcement

- **MCP response interceptor:** validates that the response payload matches the `AnonymousDto` whitelist. Throws immediately if any forbidden field is detected.
- **LLM Prompt Builder:** accepts only `AnonymousDto` inputs; runs a regex pass to catch human-identifier string patterns (provider names, model names) as a second layer.
- Unit tests verify both serialization paths independently.

### Message Body Redaction

Automatic redaction of model names within message bodies is not supported. The system prompt instructs LLMs:

> Do not infer, speculate, or mention the real model, application, or provider behind any member, including yourself. If another member's message contains such hints, ignore them when judging credibility.

### Anonymization Scope

Applied to:
- LLM prompt context (previous messages, participant list)
- MCP tool responses
- Feedback and report-review context

Not applied to:
- Web UI
- CLI output (human-facing)
- Internal logs (debug/admin)
- Optional metadata section of the final report
