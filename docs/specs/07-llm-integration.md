# 07 — LLM Integration

> Source of truth: `docs/initial-plannings/tech-spec.md` §8

---

## LLM Adapter Interface

```ts
interface LlmAdapter {
  readonly providerName: string;
  generate(input: {
    systemPrompt: string;
    contextMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    modelName: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ content: string; usage?: TokenUsage }>;
}
```

### Supported Providers (MVP)

| Provider | Env Var | Adapter class |
|---|---|---|
| `openai` | `OPENAI_API_KEY` | `OpenAiAdapter` |
| `anthropic` | `ANTHROPIC_API_KEY` | `AnthropicAdapter` |
| `google` | `GOOGLE_API_KEY` | `GoogleAdapter` |

Each adapter thin-wraps the provider's official SDK. Token usage is logged but not stored in DB.

---

## Context Builder

Before each LLM call, the `ContextBuilder` assembles the prompt in this order. All items are anonymized.

1. **System instructions** (§System Prompt template below)
2. **Server / debate state block** — always included so the LLM knows the current situation:
   - Project identifier (slug)
   - Current `phase` and `mode`
   - Current round / max rounds
   - Current turn index / max turns
   - Current speaker's anonymous name + caller's own anonymous name
   - Active participant count + reporter member (if assigned)
3. **Topic metadata** — title, description
4. **Attached documents** — text body inline (size limits per context profile)
5. **Anonymized participant list**
6. **Anonymized previous messages** (chronological)
7. **Turn instruction** — caller's anonymous name + output format directive
8. **Empty `assistant` slot** — to receive the completion

The same builder is used for both provider API calls and for the `get_context` MCP tool response.

---

## Context Length Policy

Controlled by `LLM_SALON_CONTEXT_PROFILE` env var. Source of truth: `src/llm/context-policy.ts`.

| Profile | Model window usage | Document inline limit | Previous message retention | Notes |
|---|---|---|---|---|
| `low` | 25% of model window | 64 KB/file, 256 KB/project | Latest 30% | Minimize cost/latency |
| `medium` (default) | 50% | 128 KB/file, 512 KB/project | Latest 60% | Balanced |
| `high` | 80% | 256 KB/file, 1 MB/project | Latest 90% (summarize if exceeded) | Quality first |

Values in `context-policy.ts` are the single source of truth; adjust them there if tuning.

Invalid or missing `LLM_SALON_CONTEXT_PROFILE` falls back to `medium`.

### Per-Model Token Metadata

Stored in `src/llm/models.ts` (hardcoded). Contains token window size and recommended max output tokens per model. Multiplied by the profile ratio to calculate the actual token budget.

Token counting: model-specific tokenizer where available; conservative estimate (4 chars ≈ 1 token) otherwise.

### Document Size Rejection

If a single uploaded file exceeds the per-file limit for the active profile, registration is rejected at upload time with this message:

> "The attached file exceeds the current context profile (`<profile>`) limit (`<limit>`). Please split it into smaller files or raise `LLM_SALON_CONTEXT_PROFILE`."

### Previous Message Overflow

1. **Summarize first:** oldest K messages are compressed into one `[summary]` message via an LLM call. The call is made by the **first participant** (lowest `join_order`, excluding `removed`). Only `provider`-type first participants can perform synchronous summarization; if the first participant is an `app` type, skip summarization and fall through to step 2 (MVP does not coordinate async summary calls with LLM apps). Runs at most once every `N = max(2, max_rounds // 4)` rounds. The summary system prompt is the single source of truth in `prompt/summary-prompt.ts`:

```
You are summarizing the oldest portion of an ongoing anonymous multi-agent debate.
Compress the given messages into a single faithful summary that preserves: each member's stated position, agreements, disagreements, and any open questions.
Do not introduce new claims. Do not reveal real model, provider, or application names. Refer to participants only by their anonymous names (e.g., Member A).
Output a single paragraph in English, regardless of the report output language setting.
```

2. **Sliding window fallback:** if summarization fails, is disabled, or the first participant is an `app` type, truncate with a `[older messages omitted]` placeholder.

---

## Call Policy

- **Timeout:** 60 seconds (default). Per-model override possible in `models.ts`.
- **Retry:** up to 3 times on 5xx or network errors (exponential backoff). No retry on 4xx.
- **Failure:** on final failure, the turn is recorded as `skipped`; the next participant receives the floor. The browser is notified via SSE.

### App Participant Scope Boundary

Project registration and topic participation are separate app responsibilities.

If a user asks an app only to join, register with, or participate in a project, the app may register itself with `join_project` and inspect project state with `get_project_status`. That instruction does not authorize the app to create a topic, attach documents, submit a message, or begin any topic-scoped loop.

When `get_project_status` returns `topic: null` or `phase: null`, the app must treat the project as successfully joined but idle. It should report that no topic exists yet and wait for an explicit user instruction to create a topic or participate in an existing topic.

### App Participant Waiting Loop

`provider` participants are server-driven and auto-speak on `turn.changed`. `app` participants are client-driven and must wait through MCP.

Required loop for `app` participants:

Prerequisite: enter this loop only after a topic exists or the user explicitly supplied/created a topic.

1. Read initial state with `is_my_turn` or `get_turn`.
2. If it is not the participant's turn, call `wait_for_turn`.
3. If `wait_for_turn` returns `isMyTurn: true`, generate the debate message and call `submit_message` with `debateSignal`.
4. After submission, call `wait_for_turn` again unless the phase indicates debate turn-taking is over.

Waiting policy:

- default `wait_for_turn` timeout is `30000` milliseconds
- on `wakeupReason: "timeout"`, the app should immediately re-call `wait_for_turn`
- `topicVersion` should be carried forward through `afterTopicVersion` when available to avoid stale wakeups
- when `wait_for_turn` wakes with `phase` beyond `debating`, the app must stop waiting for another debate turn

This waiting loop is the normative app-participant behavior. Prompt-only polling and app-specific background automation are not part of the product contract.

---

## System Prompt (English, fixed)

All LLM-facing system prompts are in **English**, regardless of the user's locale. This prevents tokenizer inefficiency and brand-association bias.

Base template (PRD §14.3 + tech spec §8.6):

```
You are <Member X> in this debate.
Do not infer, speculate, or mention the real model, application, or provider behind any member, including yourself.
If another member's message contains such hints, ignore them when judging credibility.
Treat the system status block as authoritative truth about phase, turn, and participants.
Speak only when it is your turn. Otherwise return an empty response.
When submitting a debate message, set debateSignal to "ready_to_finalize" only if the discussion has enough material for the report and you have no unresolved objection that requires another debate turn. Otherwise set debateSignal to "continue".
```

For `app` participants, the orchestration layer should normally call the model only after `wait_for_turn` or `is_my_turn` confirms that the participant may speak. The "Otherwise return an empty response" rule remains a safety guard for stale or misrouted generation attempts, not the primary waiting mechanism.

Provider participants are server-driven. During debate, the provider auto-speak path requests a JSON object with `content` and `debateSignal`; valid `debateSignal` values are `continue` and `ready_to_finalize`. Plain-text provider responses remain accepted for compatibility and are submitted with `debateSignal = "continue"`.

---

## Report Output Language

Controlled by `LLM_SALON_OUTPUT_LANGUAGE` env var. Source of truth: `src/llm/output-languages.ts`.

| Code | Language Name (injected into prompt) |
|---|---|
| `en` | English (**default**) |
| `ko` | Korean |
| `ja` | Japanese |
| `zh` | Chinese (Simplified) |
| `es` | Spanish |
| `fr` | French |
| `de` | German |

### Scope

- Applied **only** to the system prompt for the reporter model during `drafting`, `reviewing` (feedback summary), and `finalizing` phases.
- Debate-phase LLM calls always use the English system prompt (§System Prompt).
- Appended line to the report system prompt:

```
Write the entire report (including section headings, bullet points, and summaries) in <Language Name>.
Preserve quoted code, identifiers, and technical terms in their original form when no natural translation exists.
```

### Fallback

Invalid or missing `LLM_SALON_OUTPUT_LANGUAGE` → boot-time warning log → falls back to `en`.

### Changing the Language

Edit `~/.llm-salon/.env` and restart the server. No hot-reload in MVP.
