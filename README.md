# LLM-Salon

LLM-Salon is a local debate orchestrator for multiple LLM apps and API provider models. It runs one NestJS process on your machine, keeps discussion state in PostgreSQL, exposes a browser dashboard, and lets LLM apps join through MCP stdio.

## Important Limits

- LLM-Salon is single-user software for one OS user on one local machine.
- HTTP, SSE, REST, and MCP delegation bind to `127.0.0.1` only.
- There is no authentication in the MVP. Do not expose the port to a network.
- External access, reverse proxies, TLS, cloud sync, and multi-user accounts are outside the MVP. If you expose it anyway, you own the security model.
- API keys live only in `~/.llm-salon/.env` or `$LLM_SALON_HOME/.env`. They are not stored in the database and must not be committed.

## Requirements

- Node.js 20 or newer
- pnpm 10.11.0 or newer
- PostgreSQL 15 or newer, running locally
- At least one provider API key if you want server-driven provider participants:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GOOGLE_API_KEY`

## Install

From the repository root:

```sh
corepack enable
pnpm install
pnpm build
pnpm link --global
```

If you do not want to link the CLI globally, replace `llm-salon` in the examples below with:

```sh
node dist/cli/main.js
```

## Configure

Create the local home directory and env file:

```sh
llm-salon env init
```

Edit `~/.llm-salon/.env` and add your database URL plus any provider keys you plan to use:

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

Protect the env file:

```sh
chmod 600 ~/.llm-salon/.env
```

Create the local PostgreSQL database if it does not already exist:

```sh
createdb llm_salon
```

LLM-Salon runs Prisma migrations automatically on boot by default.

## Start

Start the local server and create or open a project:

```sh
llm-salon start "Research Salon"
```

The command prints a dashboard URL like:

```text
http://127.0.0.1:4477/projects/research-salon
```

Keep this terminal open. The MVP runs in the foreground.

## Create a Participant and Topic

In a second terminal, set the base URL printed by `llm-salon start`. If the server selected a different port, use that printed port.

```sh
BASE_URL="http://127.0.0.1:4477"
```

Register a local app participant first. Creating the topic after at least one participant exists gives the topic an initial turn holder.

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

You can also register API provider participants. The provider must have a matching API key in `~/.llm-salon/.env`; restart the server after editing `.env`.

```sh
llm-salon provider add openai --project research-salon --model gpt-5.4
```

Provider names are `openai`, `anthropic`, and `google`.

## Register an LLM App with MCP

Print the MCP registration prompt:

```sh
llm-salon mcp install-prompt
```

Copy this prompt into your LLM app's MCP configuration flow:

```text
Add an MCP server named "llm-salon" using the command `llm-salon mcp`.
After registration, call get_server_status to verify connectivity.
```

Use either the local REST/CLI participant above for a manual self-check or an MCP app registration for a real LLM app. Do not register the same app identity twice.

After the app registers, it can call `get_server_status`, choose the running project, and keep that project's `projectId` for `join_project`. If the app creates a project through MCP, it should call `create_project` and keep the returned `projectId`. It can then call `get_project_status`, `wait_for_action`, `get_context`, `submit_message`, `submit_report_draft`, `submit_report_final`, and the other MCP tools. MCP responses use anonymous participant names such as `Member A`; provider names, model names, client names, and display names are intentionally omitted from LLM-facing payloads.

## First Message Self-Check

Submit a first message with the participant and topic IDs captured above:

```sh
curl -sS \
  -X POST "$BASE_URL/api/projects/research-salon/topics/$TOPIC_ID/messages" \
  -H "Content-Type: application/json" \
  -d "{\"participantId\":\"$PARTICIPANT_ID\",\"content\":\"I will evaluate the local-first trade-offs from privacy, reliability, and collaboration angles.\"}"
```

If the caller is not the current turn holder, the server returns a `409 Conflict` with the current anonymous member. LLM apps should use `is_my_turn` before calling `submit_message`.

## Reports and Local Files

Final Markdown reports are written under:

```text
~/.llm-salon/projects/<project-slug>/reports/
```

Attachments and reports stay inside `LLM_SALON_HOME`. `.env` is handled separately and is never exposed through the document attachment path.

## Useful Commands

```sh
llm-salon project list
llm-salon topic create <project-slug> --file topic.txt
llm-salon provider add openai --project <project-slug> --model gpt-5.4
llm-salon join <project-slug> --client Codex --model gpt-5.4
llm-salon mcp install-prompt
llm-salon mcp
```

## Development Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Real provider E2E tests are opt-in:

```sh
LLM_SALON_E2E=1 pnpm test
```

See [docs/user-guide.md](docs/user-guide.md) for a longer setup and operation guide.
