# Docs Map

This file is the entry point for the repository documentation system.

Read this file first before adding or changing documents. It explains which directory owns which kind of information and where finalized rules must live.

## Principles

- `docs/specs/` is the source of truth for approved product and system behavior.
- `docs/CONTEXT.md` is the domain glossary for stable product language.
- `docs/proposals/` is for changes that are being proposed but are not yet the source of truth.
- `docs/decisions/` is for cross-cutting design decisions and their rationale.
- `docs/worklogs/` is for implementation records tied to completed work.
- `docs/analysis/` is for exploratory findings, audits, and research notes.
- `docs/initial-plannings/` preserves early planning context. Do not treat it as the current source of truth when a spec exists.
- `docs/implementation-logs/` preserves MVP phase execution history tied to the implementation plan. Do not reuse it for new post-MVP work unless the work still belongs to that phase/task system.

## Directory Guide

### `specs/`

Use `specs/` for approved, current behavior.

- Read here when you need the current rule, contract, lifecycle, invariant, or interface.
- Update here when a proposal has been accepted and the final behavior is now decided.
- Keep content normative. Avoid open-ended discussion.

### `CONTEXT.md`

Use `docs/CONTEXT.md` for stable domain terms and ambiguity resolution.

- Define terms that product, specs, and implementation should use consistently.
- Do not use it as a substitute for specs, proposals, decisions, or worklogs.

### `proposals/`

Use `proposals/` for changes under review.

- Capture the problem, proposed behavior, alternatives, risks, and affected documents.
- A proposal is not the source of truth, even if it is likely to be accepted.
- When accepted, update the relevant `specs/` files and keep the proposal as decision history.

### `decisions/`

Use `decisions/` for architectural or process choices that affect multiple files or future work.

- Record why one option was chosen over others.
- Link to the proposal that led to the decision when applicable.
- Link to the spec updates that carry the chosen behavior.

### `worklogs/`

Use `worklogs/` for implementation and follow-up records.

- Record what changed, what was verified, and what remains open.
- Link back to the related proposal and decision.
- Keep logs factual and handoff-friendly.

### `analysis/`

Use `analysis/` for investigation material that may later feed a proposal.

- Findings here can motivate work.
- Findings here do not change product behavior by themselves.

## Recommended Flow

1. Start in `analysis/` when the work begins with investigation or problem discovery.
2. Write a document in `proposals/` when a behavior, workflow, or interface change is being suggested.
3. Record a document in `decisions/` when a proposal or design branch is accepted.
4. Update `specs/` so the approved behavior becomes the current source of truth.
5. Record the actual implementation in `worklogs/`.

## Update Rules

- Do not leave the final rule only in `proposals/`.
- Do not put unresolved debates into `specs/`.
- Do not treat `analysis/` as approved policy.
- Do not use `worklogs/` as a substitute for specs.
- When a proposal is accepted, add links from the proposal to the updated spec files and, if relevant, to the decision and worklog files.
- When a proposal is rejected or replaced, mark that status clearly instead of deleting the file.

## Naming Guidance

- `proposals/`: `NNN-short-name.md`
- `decisions/`: `ADR-NNN-short-name.md`
- `worklogs/`: `YYYY-MM-DD-short-name.md`

Use short, stable names that match the main change topic.

## Reading Order

- For current product behavior: `docs/specs/`
- For an in-flight change: `docs/proposals/` then linked `docs/specs/`
- For why a choice was made: `docs/decisions/`
- For what was implemented and verified: `docs/worklogs/`
- For background investigation: `docs/analysis/`
