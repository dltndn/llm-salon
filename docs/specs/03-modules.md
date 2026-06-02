# 03 — Modules

> Source of truth: `docs/initial-plannings/tech-spec.md` §4

---

## Repository Layout

```
llm-salon/
├── src/
│   ├── main.ts                  # NestJS bootstrap entry point
│   ├── app.module.ts            # Root module
│   ├── cli/                     # CLI commands (nest-commander)
│   ├── config/                  # Env vars, path constants
│   ├── http/                    # Controllers + EJS view routing
│   │   └── views/               # *.ejs templates
│   ├── sse/                     # SSE stream module
│   ├── mcp/                     # MCP stdio server
│   ├── projects/                # Project domain
│   ├── topics/                  # Topic domain
│   ├── participants/            # Participant domain
│   ├── documents/               # Document domain
│   ├── messages/                # Message domain
│   ├── turns/                   # Turn state machine
│   ├── reports/                 # Report pipeline
│   ├── llm/                     # Provider abstraction + adapters
│   ├── prompt/                  # Anonymization + prompt builder
│   ├── events/                  # Domain events + SSE mapping
│   ├── storage/                 # Local file storage abstraction
│   ├── security/                # Env var validation, secret masking
│   └── common/                  # Shared DTOs, guards, interceptors
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/                      # Static assets (vanilla JS, CSS)
├── test/                        # Integration and e2e tests
└── docs/
```

---

## Module Responsibilities

### `cli/`
- Registers all `llm-salon` CLI commands via `nest-commander`.
- Delegates most operations to the HTTP server or boots a one-shot NestJS context when the server is not running.
- Owns: `start`, `stop`, `project list`, `status`, `join`, `topic create`, `provider add`, `env init`, `logs`, `mcp`.

### `config/`
- Loads `~/.llm-salon/.env` via `@nestjs/config`.
- Exposes typed config service for port, home dir, context profile, output language.
- Validates required keys at boot; logs warnings for optional missing keys.

### `http/`
- NestJS controllers for REST API (`/api/…`) and page routes (`/projects/:slug`).
- EJS template rendering via `@nestjs/serve-static` or direct response.
- Applies `HumanDto` vs `AnonymousDto` serialization based on `?audience=` query param or caller context.

### `sse/`
- One RxJS `Subject` per project slug.
- Subscribes to domain events from `events/` and pushes to connected SSE clients.
- Maintains a per-project reconnection queue (last 100 events).

### `mcp/`
- Implements the MCP stdio server using `@modelcontextprotocol/sdk`.
- Defines all tool schemas (JSON Schema) and delegates tool calls to HTTP endpoints.
- Applies the `AnonymousDto` interceptor to all tool responses.
- Requires the HTTP server to be running; returns a clear error if not.

### `projects/`
- CRUD for the `projects` table.
- Manages `project_status` transitions.
- Provides `ProjectService` consumed by `http/`, `cli/`, and `mcp/`.

### `topics/`
- CRUD for the `topics` table.
- Owns topic phase transition logic (see `02-domain-model.md` state machine).
- Validates phase transitions; raises `PhaseTransitionError` on illegal moves.

### `participants/`
- Registers app and provider participants.
- Enforces anonymization name assignment (sequential `Member A/B/…`).
- Enforces uniqueness constraints and phase-based registration locks.

### `documents/`
- Stores document metadata in the `documents` table.
- Writes/reads files under `LLM_SALON_HOME/projects/<slug>/documents/`.
- Validates file size against the active context profile limits.

### `messages/`
- Validates turn ownership before insert.
- Wraps message insert + turn advance in a single transaction.
- Emits `message.created` domain event after commit.

### `turns/`
- Implements the round-robin algorithm.
- Manages `turns` table lifecycle (idle → in_progress → completed/skipped).
- Provides `TurnService.advance()` used by `messages/`.

### `reports/`
- Drives the report pipeline: draft → feedback collection → final.
- Selects a provider reporter first when an active provider exists; otherwise assigns the current app turn holder as reporter when an app-only topic leaves debate.
- Calls `llm/` adapters for provider-backed draft generation and finalization.
- Accepts explicit app-reporter draft and final artifact submissions.
- Writes Markdown files to `LLM_SALON_HOME/projects/<slug>/reports/`.
- Tracks status in the `reports` table.

### `llm/`
- Defines `LlmAdapter` interface.
- Implements per-provider adapters: `OpenAiAdapter`, `AnthropicAdapter`, `GoogleAdapter`.
- Exposes `LlmService` that selects the correct adapter by `provider_name`.
- Manages timeout (60 s default), retry (3× exponential backoff on 5xx/network errors).
- References `llm/models.ts` for per-model token window metadata.
- References `llm/context-policy.ts` for context profile ratios.
- References `llm/output-languages.ts` for output language mapping.

### `prompt/`
- `ContextBuilder`: assembles the anonymized LLM input from DB data. See `07-llm-integration.md`.
- `AnonymizationGuard`: enforces no human identifiers leak into LLM payloads.

### `events/`
- Defines domain event interfaces.
- Maps domain events to SSE event payloads.
- `EventEmitter2` integration.

### `storage/`
- Abstracts local file read/write.
- Enforces path containment (all paths resolved and checked against `LLM_SALON_HOME/projects/<slug>/`).

### `security/`
- Boot-time environment variable validation (which providers are available).
- Log masking interceptor (API keys, `Authorization`, `apiKey` fields).

### `common/`
- Shared DTOs (`HumanDto`, `AnonymousDto` base classes).
- Global exception filter (maps domain errors to HTTP status codes).
- NestJS guards and interceptors used across multiple modules.

---

## Layering Rules

```
CLI / HTTP Controllers / MCP Tools
        │
        ▼
   Service Layer  (projects/, topics/, participants/, messages/, turns/, reports/)
        │
        ├──► llm/  (LLM adapter calls)
        ├──► prompt/  (context assembly)
        ├──► storage/  (file I/O)
        └──► Prisma (DB access — only from service layer, never from controllers)
```

- Controllers must not access Prisma directly.
- Services must not import controllers or MCP modules.
- `llm/` adapters must not import any domain service (no circular dependency).
- `common/` may be imported by any layer.

---

## Key Inter-Module Dependencies

| Module | Depends On |
|---|---|
| `messages/` | `turns/`, `events/`, Prisma |
| `turns/` | `participants/`, Prisma |
| `reports/` | `llm/`, `prompt/`, `storage/`, `participants/`, Prisma |
| `prompt/` | `participants/`, `messages/`, `documents/`, `llm/` (models metadata) |
| `mcp/` | All domain services (via HTTP delegation or direct injection) |
| `sse/` | `events/` |
| `security/` | `config/` |
