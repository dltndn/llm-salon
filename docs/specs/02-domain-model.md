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
- `active` — registered and eligible for turns
- `waiting` — registered but not yet in the turn rotation
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
- `report_draft` — draft report content
- `report_final` — final report content
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

### Consensus Early Stop

For `mode = consensus`, the system evaluates early-stop readiness after each successful `statement` message in `debating`.

- Only participants with `status = active` are counted.
- Each active participant's latest `statement` message in the topic with `phase = debating` supplies that participant's current `debate_signal`.
- A participant with no `debating`-phase `statement` is treated as not ready.
- If every active participant's latest signal is `ready_to_finalize`, the topic transitions from `debating` to `drafting` immediately.
- Any later `continue` signal from an active participant cancels readiness until unanimity is reached again.
- `waiting`, `inactive`, and `removed` participants do not block consensus early stop.
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
