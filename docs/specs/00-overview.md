# 00 — Overview

> Source of truth: `docs/initial-plannings/prd.md` §1–5, §20; `docs/initial-plannings/tech-spec.md` §1

---

## Product Purpose

LLM-Salon is a locally-run debate orchestrator that brings multiple LLM apps (Codex, Cursor, Claude Code, etc.) and LLM API Provider models (OpenAI, Anthropic, Google, etc.) into a single shared discussion space. It manages turn order, collects messages, and produces a final consensus report or a set of options.

The system runs as a single NestJS process on the user's local machine. No cloud backend, no multi-user accounts, no SaaS.

---

## MVP Scope

Included in MVP:

- Local NestJS server (HTTP + SSE + MCP/stdio)
- PostgreSQL for persistence
- EJS server-side rendered UI
- Project + Topic + Participant + Message + Turn + Report lifecycle
- Round-robin turn control
- Anonymization layer (display names for humans, `Member A/B/…` for LLMs)
- LLM app participants via MCP/stdio
- API Provider participants via direct adapter calls
- Document attachment (text files only)
- Report pipeline: drafting → reviewing → finalizing → finalized
- CLI (`llm-salon` commands via `nest-commander`)
- Multi-topic per project (supported from MVP; PRD §5.2 single-topic assumption overridden by tech spec §1)

Excluded from MVP: cloud sync, user accounts, moderator LLM, vector search, SPA frontend, mobile, complex permission system.

---

## Domain Terms

| Term | Definition |
|---|---|
| **Project** | A top-level discussion space. Has a `slug` (URL identifier) and a `status`. All topics, participants, documents, messages, and reports belong to a project. Project membership is distinct from topic participation. |
| **Topic** | A single debate agenda within a project. Has a `phase`, a `mode` (`consensus` or `options`), and controls round/turn limits. `consensus` topics can also leave debate early when all active participants mark their latest debate turn as ready to finalize. Topic creation and topic participation require explicit user or operator direction; they are not implied by project membership. |
| **Phase** | The current stage of a topic's lifecycle. See `02-domain-model.md` for the full state machine. |
| **Participant** | An LLM entity registered in a project. Either an `app` type (LLM app via MCP) or a `provider` type (API model called directly by the server). Registration grants project membership only; topic-scoped actions require an existing topic or an explicit instruction to create one. |
| **Display Name** | The human-visible name shown in the web UI. Format: `"App / Model"` for app participants, `"Model"` for provider participants. |
| **Anonymous Name** | The name used in all LLM-facing contexts. Format: `Member A`, `Member B`, … to prevent brand bias. |
| **Turn** | The unit that tracks which participant currently holds the floor. Persisted in the `turns` table. |
| **Round** | One full cycle through all active participants. A new round starts when every participant has had one turn. |
| **Reporter** | The participant assigned to write the draft and final report during `drafting`/`finalizing` phases. An active provider is preferred; when no active provider exists, an app participant may own report production. |
| **Actionable Task** | Work currently assigned to an app participant: a debate message, review feedback, report draft, or final report submission. |
| **Message** | A single utterance submitted by a participant during their turn. |
| **Report** | The structured output produced after the debate. Stored as a Markdown file; metadata persisted in the `reports` table. |
| **MCP** | Model Context Protocol (stdio transport). The interface used by LLM apps to call LLM-Salon tools. |
| **Context Profile** | Environment variable (`LLM_SALON_CONTEXT_PROFILE`) controlling how much of the model's token window is used. Values: `low`, `medium` (default), `high`. |
| **Output Language** | Environment variable (`LLM_SALON_OUTPUT_LANGUAGE`) controlling the language of the final report. Default: `en`. |

---

## Key Invariants

1. **Single process, single user.** One NestJS process per OS user. Multiple OS users on the same machine are not supported.
2. **Localhost only.** All interfaces bind to `127.0.0.1`. No external exposure in MVP.
3. **Anonymization is strict.** `display_name`, `provider_name`, `model_name`, `client_name` must never appear in any LLM-facing payload. Enforced by interceptor + prompt builder guard.
4. **Turn ownership is atomic.** Message submission, turn advance, and event emission happen in a single DB transaction with `SELECT … FOR UPDATE`.
5. **New participants join next round.** A participant registered mid-round waits until the next round starts.
6. **Anonymous names are permanent.** Once assigned, `anonymous_name` is never reassigned, even if the participant is removed.
7. **API keys live in `.env` only.** Keys are never stored in the database, never logged, and never passed outside the LLM adapter layer.
8. **Project registration is not topic orchestration.** For app participants, `join_project` only registers membership. It does not authorize topic creation, document attachment, or message submission unless the user explicitly requested that broader action or selected an existing topic-specific flow.
