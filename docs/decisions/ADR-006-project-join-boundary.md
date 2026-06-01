# ADR-006: Project Join Boundary

Status: Accepted
Date: 2026-06-01
Related proposal:
- `docs/proposals/005-project-join-boundary.md`

Related specs:
- `docs/specs/00-overview.md`
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/07-llm-integration.md`
- `docs/specs/09-cli.md`
- `docs/specs/10-testing.md`
- `docs/user-guide.md`

Related worklog:
- `docs/worklogs/2026-05-28-project-join-boundary.md` (planned)

## Context

LLM apps can register with a project through MCP, inspect project state, create topics, attach documents, and submit messages. The tool surface separated these actions, but the documentation did not clearly separate the user intent "join this project" from the broader intent "start or participate in this topic."

When a project has no current topic, an app that has just joined can see null topic lifecycle state. Without a normative stopping point, a general-purpose app may infer that it should complete setup by creating the first topic or submitting the first message. That overreaches the user's narrower join request.

## Options Considered

### Rely on user phrasing

- Pros:
- Requires no tool or prompt changes.
- Preserves maximum app autonomy.

- Cons:
- Leaves the same ambiguity in MCP onboarding.
- Makes accidental topic creation likely when an app tries to be helpful.
- Provides no explicit interpretation for no-topic project status.

### Remove `create_topic` from MCP

- Pros:
- Prevents one path for accidental overreach.

- Cons:
- Removes legitimate automation that users may explicitly request.
- Treats a prompt and operating-boundary issue as a tool-surface issue.

### Add a combined registration-and-status tool

- Pros:
- Could make the safe path more convenient.

- Cons:
- Adds tool surface before fixing the behavioral contract.
- Does not prevent apps from treating missing topic state as an implied request to create a topic.

### Define a strict join-only boundary

- Pros:
- Smallest behavioral correction.
- Preserves existing MCP capabilities.
- Aligns app behavior with the user's explicit intent.
- Gives no-topic project status a clear meaning.

- Cons:
- Depends on app clients following the MCP prompt and operating guidance.
- Requires examples and prompt-copy text to avoid implying topic-scoped work too early.

## Decision

Adopt a strict join-only boundary for app participants.

When the user asks an app only to join, register with, or participate in a project, the app is authorized to call `join_project` and inspect project state with `get_project_status`. That instruction does not authorize `create_topic`, `add_document`, `submit_message`, or any other topic-scoped action.

`get_project_status` must make no-topic state explicit. `topic: null` means there is no current topic available for topic-scoped actions. `phase: null` means no topic lifecycle is in progress. This state is normal and idle, not an error to repair.

After joining a project with no topic, the correct app behavior is to report successful registration, report that no topic exists yet, and wait for explicit user instruction to create a topic or participate in a specific existing topic.

`create_topic` remains available through MCP, but only as a user-directed or operator-directed action. It is not the default continuation of project registration.

MCP install guidance, dashboard prompt-copy text, the user guide, and testing expectations must preserve the boundary between project-level onboarding and topic-level participation.

## Consequences

- "Join this project" and "start a topic" are distinct app instructions.
- Idle projects remain idle after app registration.
- App clients can still create topics and participate in debate when explicitly instructed.
- The no-topic project status becomes a stable contract rather than an ambiguous setup gap.
- Regression tests must cover join-only behavior and install-prompt wording so future MCP guidance does not reintroduce the ambiguity.
