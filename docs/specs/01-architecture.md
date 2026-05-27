# 01 — Architecture

> Source of truth: `docs/initial-plannings/tech-spec.md` §1–3, §14

---

## System Diagram

```
Human User
  ├─ Browser  ──────────────────────────── GET /projects/:slug (EJS SSR)
  │                                        GET /projects/:slug/events (SSE)
  │
  ├─ LLM Apps (Codex, Cursor, Claude Code)
  │    └─ MCP/stdio ──────────────────── llm-salon mcp  →  HTTP delegation
  │                                         └─ long-poll wait (/api/.../turn/wait)
  │
  └─ CLI (llm-salon start / join / …) ── nest-commander

Single NestJS Process (127.0.0.1:<port>)
  ├─ HTTP server (Express adapter)
  │   ├─ EJS SSR pages
  │   ├─ REST API  (/api/…)
  │   └─ SSE stream (/projects/:slug/events)
  ├─ MCP/stdio server (@modelcontextprotocol/sdk)
  ├─ LLM adapters (OpenAI / Anthropic / Google SDKs)
  ├─ Turn state machine + domain events (EventEmitter2)
  ├─ Prisma ORM
  └─ Local file system (~/.llm-salon/)

External
  ├─ PostgreSQL 15+ (user-installed, localhost)
  ├─ OpenAI API
  ├─ Anthropic API
  └─ Google Gemini API
```

---

## Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20 LTS+ | Native fetch, stable ESM |
| Language | TypeScript 5.x | `strict` mode |
| Server framework | NestJS 10.x | DI, SSE, EJS integration |
| HTTP adapter | Express | Required for EJS SSR |
| Template engine | EJS | PRD §7.3 |
| Real-time | SSE (`@Sse` decorator) | PRD §7.4 |
| ORM | Prisma 5.x | Type-safe, simple migrations |
| Database | PostgreSQL 15+ | User-installed |
| Validation | `class-validator` + `class-transformer` | NestJS standard |
| Config | `@nestjs/config` (dotenv) | Loads `~/.llm-salon/.env` |
| Logging | NestJS built-in `Logger` | Minimal external deps |
| MCP | `@modelcontextprotocol/sdk` (TypeScript) | stdio transport |
| LLM SDKs | `openai`, `@anthropic-ai/sdk`, `@google/generative-ai` | Thin-wrapped per adapter |
| CLI | `nest-commander` | Same NestJS context |
| Browser open | `open` (npm) | OS default browser |
| Static assets | Vanilla CSS + Vanilla JS | No build tool |
| Testing | Jest + Supertest | NestJS default |
| Package manager | pnpm | |
| Build | `nest build` (tsc) | Single `dist/` output |

---

## Process / Deployment Model

### Single Process

- `llm-salon start <project>` boots exactly one NestJS process.
- Multiple projects share the same server instance, differentiated by URL path (`/projects/:slug`).
- Duplicate boot is prevented by a lock file at `~/.llm-salon/server.lock` (stores PID + port).

### Port

- Default: `4477`. Configurable via `--port` flag or `LLM_SALON_PORT` env var.
- If the port is in use, the server increments by 1 and retries up to 10 times.
- Final port is written to stdout and the lock file.

### Foreground Only (MVP)

- The server runs in the foreground. Closing the terminal stops the server.
- Daemon / `--detach` mode is out of scope for MVP.

### Single-User Assumption

- One OS user per machine. Multi-user scenarios (shared workstations, multi-SSH) are not supported and not documented.

---

## User Data Directory

Default location: `~/.llm-salon/` (overridable via `LLM_SALON_HOME`).

```
~/.llm-salon/
├── .env                          # API keys and optional overrides
├── server.lock                   # PID + port of the running server
├── logs/                         # Optional rotating logs
└── projects/
    └── <slug>/
        ├── documents/            # Uploaded attachment originals
        └── reports/              # Final Markdown reports
```

---

## External Services

| Service | Role | Required? |
|---|---|---|
| PostgreSQL 15+ | Primary data store | Yes (user-installed) |
| OpenAI API | LLM provider (optional participant) | Only if `OPENAI_API_KEY` is set |
| Anthropic API | LLM provider (optional participant) | Only if `ANTHROPIC_API_KEY` is set |
| Google Gemini API | LLM provider (optional participant) | Only if `GOOGLE_API_KEY` is set |

---

## Logging

- Logger: NestJS built-in `Logger`. Module context label per class.
- Default level: `log`. Enable `debug` with `--verbose`.
- Request context (request ID, project slug) injected via `AsyncLocalStorage`.
- Provider call latency is logged; no metrics system in MVP.
- API keys and `Authorization` headers are masked in all log output by a serialization interceptor.

---

## App Participant Waiting Path

- `provider` participants continue to advance through the server-owned auto-speak path triggered by `turn.changed`.
- `app` participants wait for their next turn through MCP `wait_for_turn`, which delegates to an HTTP long-poll endpoint.
- The long-poll endpoint is part of the same single NestJS process and listens to the same turn/topic change events that drive browser SSE and provider auto-speak.
- Browser SSE remains human-facing only. App waiting does **not** consume the browser SSE stream directly.
- Waiting requests use a finite timeout of 30 seconds by default. After timeout, the app client is expected to re-call the wait operation unless the topic phase indicates no further debate turn is expected.
