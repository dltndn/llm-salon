# 04 — Database

> Source of truth: `docs/initial-plannings/tech-spec.md` §5

---

## General Policies

- **Primary keys:** `uuid`, default `gen_random_uuid()` (requires `pgcrypto` extension).
- **Slugs:** human-readable URL identifiers, unique per scope.
- **Timestamps:** all timestamp columns use `timestamptz` (UTC).
- **Foreign keys:** `ON DELETE CASCADE` for all child-of-project relations.
- **ORM:** Prisma 5.x. Schema file: `prisma/schema.prisma`.
- **Migrations:** Prisma Migrate. First migration: `0001_init`. Auto-applied at boot via `prisma migrate deploy` when `--auto-migrate` is on (default). Exception: if boot just created `~/.llm-salon/.env` on this first run and `DATABASE_URL` is still unset, migration is skipped for that boot and startup prints guidance to fill `DATABASE_URL` and restart.

---

## Tables

### `projects`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `slug` | `text` | UNIQUE, NOT NULL | URL identifier |
| `name` | `text` | NOT NULL | Display name |
| `status` | `project_status` | NOT NULL, default `created` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

### `topics`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK → `projects.id`, NOT NULL | |
| `title` | `text` | NOT NULL | |
| `description` | `text` | NULL | |
| `mode` | `topic_mode` | NOT NULL, default `consensus` | |
| `phase` | `topic_phase` | NOT NULL, default `preparing` | |
| `max_rounds` | `int` | NULL | NULL = no limit |
| `max_turns` | `int` | NULL | NULL = no limit |
| `current_round` | `int` | NOT NULL, default `0` | |
| `current_turn_index` | `int` | NOT NULL, default `0` | |
| `reporter_participant_id` | `uuid` | FK → `participants.id`, NULL | Set when entering `drafting` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

### `participants`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK → `projects.id`, NOT NULL | |
| `display_name` | `text` | NOT NULL | e.g. `Codex / GPT-5.1` |
| `anonymous_name` | `text` | NOT NULL | e.g. `Member A` |
| `participant_type` | `participant_type` | NOT NULL | `app` or `provider` |
| `provider_name` | `text` | NULL | Provider type only |
| `model_name` | `text` | NULL | Both types |
| `client_name` | `text` | NULL | App type only |
| `status` | `participant_status` | NOT NULL, default `waiting` | |
| `join_order` | `int` | NOT NULL | Round-robin sort key |
| `joined_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

Additional constraints:
- `UNIQUE(project_id, anonymous_name)`
- `UNIQUE(project_id, client_name, model_name) WHERE participant_type = 'app' AND status <> 'removed'`
- `UNIQUE(project_id, provider_name, model_name) WHERE participant_type = 'provider' AND status <> 'removed'`

### `documents`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK, NOT NULL | |
| `topic_id` | `uuid` | FK, NULL | NULL = project-level document |
| `file_name` | `text` | NOT NULL | |
| `file_path` | `text` | NOT NULL | Relative to `LLM_SALON_HOME` |
| `mime_type` | `text` | NOT NULL | |
| `size_bytes` | `bigint` | NOT NULL | |
| `content_hash` | `text` | NOT NULL | SHA-256 hex |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

### `messages`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK, NOT NULL | |
| `topic_id` | `uuid` | FK, NOT NULL | |
| `participant_id` | `uuid` | FK, NOT NULL | |
| `kind` | `message_kind` | NOT NULL, default `statement` | |
| `turn_index` | `int` | NOT NULL | |
| `round_index` | `int` | NOT NULL | |
| `phase` | `topic_phase` | NOT NULL | Phase snapshot at time of submission |
| `content` | `text` | NOT NULL, length ≤ 32 KB | |
| `debate_signal` | `debate_signal` | NOT NULL, default `continue` | Used for consensus early stop on `statement` messages |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

### `turns`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK, NOT NULL | |
| `topic_id` | `uuid` | FK, NOT NULL | |
| `current_participant_id` | `uuid` | FK, NULL | NULL when skipped |
| `turn_index` | `int` | NOT NULL | |
| `round_index` | `int` | NOT NULL | |
| `phase` | `topic_phase` | NOT NULL | |
| `status` | `turn_status` | NOT NULL, default `idle` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

Additional constraint: `UNIQUE(topic_id, turn_index)`.

### `reports`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK, NOT NULL | |
| `topic_id` | `uuid` | FK, NOT NULL | |
| `reporter_participant_id` | `uuid` | FK, NOT NULL | |
| `status` | `report_status` | NOT NULL, default `none` | |
| `draft_content` | `text` | NULL | |
| `final_content` | `text` | NULL | |
| `file_path` | `text` | NULL | Path to saved Markdown file |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

Note: One report row per topic. Uniqueness enforced at the application level.

---

## Indexes

| Index | Purpose |
|---|---|
| `messages(topic_id, created_at)` | Chronological message retrieval |
| `messages(topic_id, turn_index, round_index)` | Debate replay |
| `participants(project_id, join_order)` | Round-robin determination |
| `turns(topic_id, status)` | Fast lookup of the active turn |

---

## Dropped Tables

`provider_credentials_meta` (appeared in earlier drafts) is **removed**. API keys are managed exclusively via `.env` files and loaded into `process.env` at boot. No DB column stores API key metadata.
