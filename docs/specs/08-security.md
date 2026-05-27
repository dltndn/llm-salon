# 08 — Security & API Key Handling

> Source of truth: `docs/initial-plannings/tech-spec.md` §12

---

## .env File

### Location

`~/.llm-salon/.env` (or `$LLM_SALON_HOME/.env`)

### Lifecycle

1. On first boot or `llm-salon env init`, if the file does not exist, the bundled `.env.example` is copied to `~/.llm-salon/.env` and the path is printed to stdout.
2. If the file already exists, it is never overwritten.
3. `@nestjs/config` loads the file at boot and injects values into `process.env`. OS environment variables take precedence over file values for the same key.
4. Any change requires a server restart (hot-reload not supported in MVP).

### Template (`.env.example`)

```dotenv
# Copy this file to ~/.llm-salon/.env and fill in the keys you plan to use.
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=

# Optional overrides
# LLM_SALON_PORT=4477
# LLM_SALON_CONTEXT_PROFILE=medium
# LLM_SALON_OUTPUT_LANGUAGE=en   # one of: en, ko, ja, zh, es, fr, de
```

---

## API Key Principles

- API keys are **never** stored in the database.
- API keys are **never** printed in logs, SSE payloads, or domain events.
- `process.env.<KEY>` is accessed only inside the LLM adapter layer (`src/llm/`). Controllers and service layers do not receive raw key values.
- The NestJS Logger serialization interceptor masks any field named `apiKey`, `Authorization`, or matching known env var key patterns before writing to log output.
- File permission: README recommends `chmod 600 ~/.llm-salon/.env`.
- Shell rc auto-modification and `child_process`-based env injection are **not used**.

---

## Boot-Time Provider Validation

At startup, the server checks which provider API keys are present in `process.env` and stores the result in memory (not in DB). If a user tries to `provider add` for a provider without a key, the command fails with:

```
Missing GOOGLE_API_KEY. Set it in ~/.llm-salon/.env (copy from .env.example) and try again.
```

---

## File System Boundaries

- All attachment and report file paths are resolved against `LLM_SALON_HOME/projects/<slug>/`.
- User-supplied paths are sanitized with `path.resolve` + base-prefix check before any file operation.
- `.env` is handled separately (whitelist) and is never accessible via the document attachment path API.

---

## Network Binding

- All HTTP interfaces bind to `127.0.0.1` only.
- External network exposure is explicitly **not supported** in MVP.
- Users who require external access must configure their own TLS/reverse proxy and accept full responsibility (documented in README).
