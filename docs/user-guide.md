# LLM-Salon User Guide

This guide expands the README setup path for a local user or an LLM agent installing LLM-Salon from the repository.

## Local-Only Operating Model

LLM-Salon is designed for one user on one local machine. It binds to `127.0.0.1`, has no authentication in the MVP, and should not be exposed to other machines. External access requires your own reverse proxy, TLS, and access-control decisions.

The server stores runtime data under `~/.llm-salon/` by default:

```text
~/.llm-salon/
├── .env
├── server.lock
└── projects/
    └── <slug>/
        ├── documents/
        └── reports/
```

Set `LLM_SALON_HOME` before boot if you need a different directory.

## Fresh Install Checklist

1. Install Node.js 20+, pnpm 10.11.0+, and PostgreSQL 15+.
2. From the repository root, run `corepack enable`, `pnpm install`, and `pnpm build`.
3. Run `pnpm link --global` if you want the `llm-salon` command on your PATH.
4. Run `llm-salon env init`.
5. Add `DATABASE_URL` and provider API keys to `~/.llm-salon/.env`.
6. Run `chmod 600 ~/.llm-salon/.env`.
7. Create the PostgreSQL database, for example `createdb llm_salon`.
8. Start the app with `llm-salon start "<project name>"`.
9. Register at least one participant before creating the first topic so the topic starts with an active turn.

If the first boot creates `.env` and `DATABASE_URL` is still missing, migrations are skipped for that boot. Fill in `DATABASE_URL`, restart the server, and migrations will run.

## Environment Variables

`~/.llm-salon/.env` is loaded at boot. OS environment variables override values from the file. Restart the server after any `.env` change.

```dotenv
DATABASE_URL="postgresql://localhost:5432/llm_salon?schema=public"
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=

# Optional
# LLM_SALON_PORT=4477
# LLM_SALON_CONTEXT_PROFILE=medium
# LLM_SALON_OUTPUT_LANGUAGE=en
```

Provider keys are read only by the LLM adapter layer. They are not stored in PostgreSQL, emitted in SSE events, or included in MCP responses.

## Normal Workflow

Start or reopen a project:

```sh
llm-salon start "Research Salon"
```

In a second terminal, set the base URL printed by `llm-salon start`. If the server selected a different port, use that printed port.

```sh
BASE_URL="http://127.0.0.1:4477"
```

Register a manual app participant for local REST checks:

```sh
PARTICIPANT_JSON=$(curl -sS \
  -X POST "$BASE_URL/api/projects/research-salon/participants" \
  -H "Content-Type: application/json" \
  -d '{"participantType":"app","clientName":"Local CLI","modelName":"manual"}')

PARTICIPANT_ID=$(node -e 'const fs = require("node:fs"); console.log(JSON.parse(fs.readFileSync(0, "utf8")).id)' <<< "$PARTICIPANT_JSON")
```

Create a topic:

```sh
TOPIC_JSON=$(curl -sS \
  -X POST "$BASE_URL/api/projects/research-salon/topics" \
  -H "Content-Type: application/json" \
  -d '{"title":"Should local-first AI tools keep all orchestration data on the user machine?","description":"Compare privacy, reliability, and collaboration trade-offs."}')

TOPIC_ID=$(node -e 'const fs = require("node:fs"); console.log(JSON.parse(fs.readFileSync(0, "utf8")).id)' <<< "$TOPIC_JSON")
```

Submit the first message as the current participant:

```sh
curl -sS \
  -X POST "$BASE_URL/api/projects/research-salon/topics/$TOPIC_ID/messages" \
  -H "Content-Type: application/json" \
  -d "{\"participantId\":\"$PARTICIPANT_ID\",\"content\":\"I will evaluate the local-first trade-offs from privacy, reliability, and collaboration angles.\"}"
```

Register API provider participants when you want the server to call provider models automatically:

```sh
llm-salon provider add openai --project research-salon --model gpt-5.4
llm-salon provider add anthropic --project research-salon --model claude-sonnet-4-5
llm-salon provider add google --project research-salon --model gemini-2.5-pro
```

Open the printed dashboard URL to watch participants, messages, topic phase, draft report, and final report status.

## MCP App Setup

Run:

```sh
llm-salon mcp install-prompt
```

Use the printed prompt in an LLM app that supports MCP:

```text
Add an MCP server named "llm-salon" using the command `llm-salon mcp`.
After registration, call get_server_status to verify connectivity.
```

For a real LLM app, use MCP registration instead of the manual REST participant above. Do not register the same app identity twice.

The app should then:

1. Call `get_server_status` to find running projects.
2. Choose a running project and keep its `projectId`.
3. If it needs to create its own project, call `create_project` and keep the returned `projectId`.
4. Call `join_project` with that `projectId` and keep the returned `participantId`.
5. Call `get_project_status` and `get_turn`.
6. Call `is_my_turn` before speaking.
7. Call `submit_message` only when it is the current turn holder.

MCP payloads are anonymized. LLM-facing responses identify participants as `Member A`, `Member B`, and so on.

## Troubleshooting

`Missing OPENAI_API_KEY` or another provider key:
Add the matching key to `~/.llm-salon/.env`, restart `llm-salon start`, and retry `provider add`.

`DATABASE_URL is not set`:
Add `DATABASE_URL` to `~/.llm-salon/.env`, create the database if needed, and restart the server.

Port already in use:
LLM-Salon increments from the requested port up to 10 attempts. The actual URL is printed at startup and stored in `~/.llm-salon/server.lock`.

Wrong turn errors:
The debate is turn-based. Use `get_turn` or `is_my_turn` before submitting a message.

No browser opens:
The start command always prints the URL. Open it manually in a browser on the same machine.

## Data and Reports

Reports are saved as Markdown under:

```text
~/.llm-salon/projects/<project-slug>/reports/
```

Project attachments are text-only in the MVP. File paths are resolved under the project directory; `.env` is not reachable through document APIs.
