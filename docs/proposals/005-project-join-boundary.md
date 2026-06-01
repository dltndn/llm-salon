# Proposal 005: Project Join Boundary For App Participants

Status: Implemented
Owner: Codex
Created: 2026-05-28
Accepted: 2026-06-01
Related analysis:
- Local documentation review on 2026-05-28 covering MCP onboarding, project-status semantics, and the missing boundary between `join_project` and `create_topic`

Related specs:
- `docs/specs/00-overview.md`
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/07-llm-integration.md`
- `docs/specs/09-cli.md`
- `docs/specs/10-testing.md`
- `docs/user-guide.md`

Decision:
- `docs/decisions/ADR-006-project-join-boundary.md`

Planned worklog:
- `docs/worklogs/2026-05-28-project-join-boundary.md`

## Summary

Define an explicit boundary between project registration and topic orchestration for `app` participants. When an LLM app is asked to join a project, the default allowed action should be `join_project` only. After registration, the app may inspect project state, but it must not create a topic, add documents, or submit messages unless the user explicitly asked for that broader action or an already-existing topic-specific participation flow is in effect.

## Problem

The current documentation separates the tools but not the operating boundary strongly enough:

- `join_project` and `create_topic` are separate MCP tools in `docs/specs/06-mcp.md`
- the MCP install prompt only says to register the server and call `get_server_status`
- `docs/user-guide.md` currently tells the app to call `join_project`, then `get_project_status` and `get_turn`, even though `get_turn` is topic-scoped and no "no topic exists yet" rule is defined
- the debate-phase system prompt in `docs/specs/07-llm-integration.md` governs turn-taking behavior, not pre-debate project lifecycle behavior

That leaves an under-specified gap:

- an app can correctly understand that it joined a valid project
- the same app can also see `phase: null` or a project with no current topic
- because the docs do not define the proper stopping point, the app may infer that it should "finish setup" by creating a topic or even starting the first message

This overreaches the user's intent. "Join the project" is a narrower action than "start or configure a discussion."

## Scope

- Included:
- Define `join_project` as a registration-only action for app-participant operating guidance.
- Define the expected post-join behavior when no topic exists yet.
- Separate the project-level onboarding flow from the topic-level debate flow.
- Update the MCP install prompt and user guide so they do not imply that topic creation is a default continuation of joining.
- Add regression expectations for the join-only contract and no-topic idle behavior.

- Excluded:
- Removing `create_topic` from MCP.
- Changing debate turn order, consensus logic, or report generation.
- Automatically creating topics on behalf of users.
- Adding authentication, permissions, or moderator approval flows.
- Redesigning the dashboard or human REST workflow.

## Proposed Change

### 1. Define `join_project` as registration, not setup completion

For `app` participants, `join_project(projectId, clientName, modelName)` should be treated as a side-effect-limited registration action.

Normative rule:

- if the user asks the app only to join, register, or participate in a project, that instruction authorizes `join_project` only
- joining a project does not by itself authorize `create_topic`, `add_document`, or `submit_message`
- joining a project does not by itself authorize the app to "complete" missing project state on the user's behalf

This proposal does not change the tool surface. It changes the operating contract around when a tool may be used.

### 2. Define the post-join stopping point when no topic exists

After `join_project`, the app may call `get_project_status(projectIdOrSlug)` to inspect the current project state.

If the project has no active or selected topic yet, the status contract should make that idle condition explicit and the app should stop there.

Required interpretation:

- `phase: null` means there is no current topic-level lifecycle in progress
- `topic: null` means there is no current topic available for topic-scoped actions
- when the project is in that state, the correct app behavior is:
  - report that project registration succeeded
  - report that no topic exists yet
  - wait for an explicit instruction to create a topic or participate in a named/existing topic

The app must not treat the absence of a topic as an error that it should repair automatically.

### 3. Split app guidance into two operating loops

The documentation should distinguish two separate flows.

Project-level onboarding flow:

1. Call `get_server_status`.
2. Select an existing project or create a new one only if explicitly requested.
3. Call `join_project`.
4. Call `get_project_status`.
5. If no topic exists, stop and await instruction.

Topic-level participation flow:

1. Start only when a topic already exists or the user explicitly asked the app to create one.
2. Obtain the relevant `topicId`.
3. Call `get_turn` or `is_my_turn`.
4. Use `wait_for_turn` during debate as already defined.
5. Call `submit_message` only when the turn contract allows it.

This removes the current ambiguity where joining is described next to turn-taking without a clear boundary between them.

### 4. Make topic creation explicitly user-directed

`create_topic` should remain available, but its expected use should be narrowed.

Required rule:

- `create_topic` is a user-directed or operator-directed action
- it is not the default next step after joining a project
- an app may create a topic only when the user explicitly asks to start a topic, create a topic, or begin a discussion on a specified agenda

This proposal does not prevent powerful automation. It requires the automation to be clearly authorized by the user's request.

### 5. Strengthen the printed MCP install prompt

The prompt printed by `llm-salon mcp install-prompt` should include an explicit scope guard.

Required additions:

- after joining a project, inspect state before acting
- if no topic exists, stop after reporting successful registration
- do not create topics or send messages unless explicitly instructed

The install prompt is currently too minimal to establish this behavioral boundary for general-purpose LLM apps.

### 6. Add coverage for the no-topic idle contract

The testing spec should require coverage for:

- a join-only flow where the app registers successfully and does not mutate project state further
- `get_project_status` behavior for a project with no topic
- install-prompt or operating-guidance text that clearly separates joining from topic creation

The goal is to keep this boundary from regressing as MCP guidance evolves.

## User-Visible Effects

- telling an LLM app to "join the project" no longer implies that it should create a topic
- idle projects remain idle after app registration
- apps still can create topics and participate in debate when the user asks for that broader action explicitly
- topic-scoped tools are used only after a topic exists or is intentionally created

## Affected Documents

- `docs/specs/00-overview.md`
  Clarify the distinction between project membership and topic participation in the product vocabulary.
- `docs/specs/05-api.md`
  Update dashboard prompt-copy text so project prompts stop at registration/status and topic prompts require an existing topic flow.
- `docs/specs/06-mcp.md`
  Define the `join_project` operating boundary, the no-topic interpretation of `get_project_status`, and the split between project-level and topic-level app flows.
- `docs/specs/07-llm-integration.md`
  Add app operating guidance that explicitly forbids scope expansion from registration into topic creation or message submission.
- `docs/specs/09-cli.md`
  Expand the `llm-salon mcp install-prompt` contract so the printed prompt includes the join-only boundary.
- `docs/specs/10-testing.md`
  Add regression expectations for the no-topic idle path and for join-only guidance.
- `docs/user-guide.md`
  Rewrite the MCP app setup sequence so `get_turn` is not presented as an unconditional post-join step.

## Alternatives Considered

### Option A: Keep the current docs and rely on user phrasing

Rejected as the primary design.

Pros:

- no spec or prompt changes
- maximum flexibility for proactive apps

Cons:

- repeats the same ambiguity
- makes overreach likely whenever an app tries to be helpful
- leaves "join only" with no normative stopping point

### Option B: Remove `create_topic` from MCP entirely

Rejected.

Pros:

- eliminates one path for accidental overreach

Cons:

- removes legitimate automation that users may explicitly want
- over-corrects a documentation and operating-contract problem with a surface-area reduction

### Option C: Add a new combined tool for registration and inspection

Not recommended for this proposal.

Pros:

- could make the safe path more convenient

Cons:

- adds tool surface without first fixing the missing behavioral contract
- still would not solve misuse if the app keeps treating topic creation as an implied follow-up

### Option D: Keep the existing tools and define a strict join-only boundary

Recommended.

Pros:

- smallest safe correction
- addresses the root ambiguity directly
- preserves existing MCP capabilities
- aligns app behavior with user intent instead of proactive guesswork

Cons:

- depends on apps following the improved prompt and operating guidance
- may require updating examples that currently imply a smoother transition into debate

## Risks

- Some LLM apps may still ignore the stronger wording and continue to overreach.
- Mitigation: put the rule in multiple normative places: MCP spec, LLM integration guidance, CLI install prompt, and user guide.

- Existing examples may still imply topic-scoped behavior too early.
- Mitigation: update example sequences so `get_turn` appears only after a topic is known to exist.

- The no-topic state may remain ambiguous if `get_project_status` nullability is not clarified precisely.
- Mitigation: make the null-state interpretation explicit in the MCP spec and test expectations.

## Acceptance Notes

Before this proposal is accepted, the repository should agree that:

- "join the project" and "start a topic" are distinct user intents
- `join_project` should not be treated as permission to repair or complete missing topic state
- topic creation remains available to apps, but only under explicit user direction
- the printed install prompt is part of the behavioral contract for LLM apps, not just a connectivity hint

Before this proposal is reflected in the live specs, the following should be true:

- `docs/specs/06-mcp.md` defines the join-only boundary and no-topic stopping rule
- `docs/specs/07-llm-integration.md` separates project onboarding from debate participation
- `docs/specs/09-cli.md` requires the stronger install prompt
- `docs/user-guide.md` no longer instructs apps to call `get_turn` unconditionally after joining

## Status History

- 2026-05-28: Draft created to stop app participants from expanding project registration into unauthorized topic creation.
- 2026-06-01: Accepted; promoted into MCP, LLM integration, CLI, API prompt-copy, testing, and user-guide specs.
