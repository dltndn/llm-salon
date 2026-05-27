# Worklogs Guide

`docs/worklogs/` stores concise records of implementation work after the repository's original MVP phase logs.

Use this directory for post-MVP or ongoing changes that need a factual handoff record without forcing the work into the older phase/task structure in `docs/implementation-logs/`.

## What Belongs Here

Put a worklog here when you completed or substantially advanced work that should leave behind:

- a clear summary of what changed
- links to the proposal or decision that justified the work
- verification status
- remaining risks or follow-ups

Do not use this directory for:

- planning the change before it is accepted
- defining the final source of truth
- reproducing low-signal command transcripts

## Relationship To Other Directories

- `proposals/` explains what change was requested.
- `decisions/` explains why a path was chosen when that rationale matters.
- `specs/` defines the final approved behavior.
- `worklogs/` records what was actually implemented and checked.

## File Naming

Use one file per implementation slice or cohesive change:

- `YYYY-MM-DD-short-name.md`

If a change spans multiple sessions, append entries to the same file while the scope remains the same.

## Workflow

1. Create or update a worklog file once the work is implemented or meaningfully progressed.
2. Link the related proposal and decision when they exist.
3. Record the files or areas changed.
4. Record what was verified and what was not verified.
5. Record any remaining risks, assumptions, or required follow-up.

## Template

```md
# Worklog: Short Name

Date: YYYY-MM-DD
Status: In Progress
Related proposal:
- `docs/proposals/...`

Related decision:
- `docs/decisions/...` (optional)

Related specs:
- `docs/specs/...`

## Change Summary

- What changed
- What changed

## Files Or Areas Touched

- `path/to/file`
- `path/to/file`

## Verification

- Completed:
  - command or manual check
- Not completed:
  - skipped check and reason

## Risks Or Follow-ups

- Open risk
- Follow-up item

## Notes For Next Work

- What to read first
- What assumption to preserve
```

## Writing Rules

- Keep entries factual and brief.
- Record only the details that matter for verification or handoff.
- If a spec was updated as part of the work, link it.
- If the work deviated from an accepted proposal or decision, say so explicitly.
- If no meaningful implementation happened, do not create a worklog just to mirror discussion.

## Status Guidance

Recommended statuses:

- `In Progress`
- `Done`
- `Blocked`

Use `Done` only when the scoped work is complete enough that the next contributor does not need to reconstruct what happened from the diff alone.
