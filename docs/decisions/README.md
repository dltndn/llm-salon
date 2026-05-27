# Decisions Guide

`docs/decisions/` stores durable decisions and their rationale.

Use this directory when the repository needs a stable explanation for why a cross-cutting choice was made. A decision document is not an implementation log and is not a draft proposal.

## What Belongs Here

Put a decision here when:

- multiple viable options existed
- the choice affects several specs, modules, or workflows
- future contributors will need the reasoning to avoid reopening the same debate
- a proposal was accepted and the reasoning should be preserved

Do not use this directory for:

- early brainstorming better suited for `docs/proposals/`
- final behavior definitions that belong in `docs/specs/`
- step-by-step implementation notes that belong in `docs/worklogs/`

## Relationship To Proposals

- A decision may be created from a proposal.
- If so, link the proposal near the top of the decision file.
- The decision records why a path was chosen.
- The spec records what the chosen path now requires.

Not every proposal needs a decision file. Use one when the rationale is important enough to preserve independently.

## Workflow

1. Create `ADR-NNN-short-name.md`.
2. Link the related proposal, if one exists.
3. Summarize the context and the options considered.
4. State the chosen decision and its consequences.
5. Link the affected `docs/specs/` files.
6. Link the `docs/worklogs/` entry once implementation happens.

## Template

```md
# ADR-NNN: Short Name

Status: Accepted
Date: YYYY-MM-DD
Related proposal:
- `docs/proposals/...`

Related specs:
- `docs/specs/...`

Related worklog:
- `docs/worklogs/...` (optional)

## Context

What situation required a decision?

## Options Considered

### Option A

- Pros:
- Cons:

### Option B

- Pros:
- Cons:

## Decision

State the chosen option clearly.

## Consequences

- Positive effect
- Trade-off
- Follow-up expectation
```

## Writing Rules

- Optimize for durable reasoning, not narrative history.
- State the rejected alternatives briefly but explicitly.
- Keep the decision itself unambiguous.
- If the decision changes or constrains future specs, link those specs directly.
- If a prior decision is replaced, create a new decision file and mark the older one as superseded instead of rewriting history.

## Status Guidance

Recommended statuses:

- `Proposed`
- `Accepted`
- `Superseded`

Use `Accepted` only when the direction is settled enough that related specs can rely on it.
