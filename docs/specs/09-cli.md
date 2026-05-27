# 09 — CLI

> Source of truth: `docs/initial-plannings/tech-spec.md` §9

---

## Commands

| Command | Action | Server required? |
|---|---|---|
| `llm-salon start <project>` | Boot server, create/open project, open browser | Self-boots |
| `llm-salon stop` | Shut down the running server | Lock file + signal |
| `llm-salon project list` | Print all project metadata | HTTP if running; one-shot boot otherwise |
| `llm-salon status <project>` | Print current phase/turn/participants | Same as above |
| `llm-salon join <project> --client <name> --model <name>` | Register an LLM app participant | HTTP |
| `llm-salon topic create <project> --file <path>` | Create a topic (content from file) | HTTP |
| `llm-salon provider add <provider> --project <p> --model <m>` | Register an API provider participant; validates env var | HTTP |
| `llm-salon env init` | Copy `.env.example` → `~/.llm-salon/.env` if absent; print path | Self-contained |
| `llm-salon logs <project>` | Tail recent messages | HTTP |
| `llm-salon mcp` | Start stdio MCP server (spawned by LLM apps) | HTTP delegation |
| `llm-salon mcp install-prompt` | Print the copy-pasteable MCP registration prompt | Self-contained |

---

## Boot Flow (`llm-salon start`)

1. Create `~/.llm-salon/` if it does not exist.
2. If `~/.llm-salon/.env` is absent, copy `.env.example` and print guidance to stdout.
3. Load `~/.llm-salon/.env` via `@nestjs/config`.
4. Determine port: `--port` flag → `LLM_SALON_PORT` env var → default `4477`. If the port is in use, increment by 1 and retry up to 10 times.
5. Run Prisma migrations (`prisma migrate deploy`). Controlled by `--auto-migrate` flag (default: on). If this boot just created `~/.llm-salon/.env` and `DATABASE_URL` is still unset, skip migration for that boot, print guidance to fill `DATABASE_URL`, and continue startup.
6. Bootstrap NestJS application context.
7. Write PID + port to `~/.llm-salon/server.lock`.
8. Call `open("http://127.0.0.1:<port>/projects/<slug>")`. On failure: print warning to stderr; always print the URL to stdout.

---

## stdin Interaction

CLI is designed for non-interactive (scripted) invocation by LLM apps. There is no secure API key prompt. If a required env var is missing:

```
Missing GOOGLE_API_KEY. Set it in ~/.llm-salon/.env (copy from .env.example) and try again.
```

Printed to stderr; process exits with a non-zero code.

---

## Single-Instance Lock

`~/.llm-salon/server.lock` stores the running server's PID and port. On `llm-salon start`, if the lock file exists and the PID is alive, the new process exits with an appropriate message instead of starting a duplicate server.
