# Proposals Guide

`docs/proposals/` stores change proposals that are under discussion or awaiting implementation.

The purpose of a proposal is to define a candidate change clearly enough that the repository can decide whether to adopt it and, if adopted, which specs must change.

## What Belongs Here

Put a document here when you need to propose:

- a new feature
- a behavior change
- a new CLI, API, or MCP surface
- a significant documentation policy change
- a workflow or operational improvement that affects current product expectations

Do not use this directory for:

- raw investigation notes better suited for `docs/analysis/`
- approved final rules that belong in `docs/specs/`
- implementation history that belongs in `docs/worklogs/`
- architecture rationale without an active proposed change, which belongs in `docs/decisions/`

## Status Model

Each proposal should declare one of these statuses near the top:

- `Draft`: still being shaped
- `Accepted`: approved; required spec updates should exist or be in progress
- `Implemented`: approved and reflected in the codebase; related spec updates should already exist and the related worklog should exist or be in progress
- `Rejected`: intentionally not adopted
- `Superseded`: replaced by a newer proposal

Accepted and implemented proposals stay in this folder as historical context. They do not replace `docs/specs/`.

## Workflow

1. Create a new proposal file using the naming pattern `NNN-short-name.md`.
2. Describe the problem, scope, proposed change, alternatives, and affected docs.
3. Link the relevant current spec files.
4. Update the status when the proposal is accepted, implemented, rejected, or superseded.
5. If accepted, update the linked `docs/specs/` files so the proposal is reflected in the current source of truth.
6. After implementation, update the proposal status to `Implemented` and add links to the related `docs/decisions/` and `docs/worklogs/` files.

## Relationship To Other Directories

- `analysis/` can feed a proposal.
- `proposals/` can lead to a `decisions/` record.
- `specs/` must absorb accepted behavior.
- `worklogs/` should record implementation against the accepted or implemented proposal.

## Template

```md
# Proposal NNN: Short Name

Status: Draft
Owner:
Created: YYYY-MM-DD
Related analysis:
- `docs/analysis/...`

Related specs:
- `docs/specs/...`

Planned decision:
- `docs/decisions/...` (optional)

Planned worklog:
- `docs/worklogs/...` (optional)

## Summary

One short paragraph describing the proposed change.

## Problem

What is wrong or missing today?

## Scope

- Included:
- Excluded:

## Proposed Change

- Required behavior
- User-visible effects
- System or process changes

## Affected Documents

- `docs/specs/...`
- `docs/user-guide.md`

## Alternatives Considered

- Option A
- Option B

## Risks

- Risk
- Mitigation

## Acceptance Notes

- What must be true before this can be considered accepted?

## Status History

- YYYY-MM-DD: Draft created
```

## Writing Rules

- Be concrete about the change.
- Separate current behavior from proposed behavior.
- Name the spec files that must change if accepted.
- Keep rejected options short but explicit.
- If the proposal changes public behavior, call that out directly.

## After Acceptance

When a proposal becomes `Accepted`:

- keep the file
- update its status
- add links to the resulting spec updates
- add links to any related decision or worklog
- avoid continuing to edit it as if it were the live spec

When the accepted proposal is reflected in code:

- update the status to `Implemented`
- link the implementation worklog if one exists
- keep the proposal as historical context rather than the live source of truth
