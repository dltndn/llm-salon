# Implementaion Logs Guide

## Purpose

This directory stores handoff-oriented implementaion logs for work performed against the phase structure in `docs/implementation-plan-en.md`.

A phase file is only the storage container. The execution, commit, and handoff unit is always the individual task from `docs/implementation-plan-en.md`.

Each log should help the next worker answer four questions quickly:

1. What phase and task was worked on?
2. What changed and why does it matter?
3. What dependencies were satisfied, changed, or newly introduced?
4. What must the next worker know before continuing?

The goal is not a full changelog. The goal is a practical handoff record focused on what the next worker must not miss.

## Required Workflow

Before starting work:

1. Read this file.
2. Read `docs/implementation-plan-en.md`.
3. Find the current phase and task you are about to work on.
4. Read all existing logs relevant to:
   - the same phase
   - direct dependency tasks from the plan
5. Check the **Open questions** section of the immediately preceding task log. If any question is still marked `[ ]` (unresolved), **stop**. Do not make any changes. Report the unresolved questions to the user and wait for explicit resolution before proceeding.
6. Reflect any still-relevant findings from those logs into your current work before making changes.

After finishing a task:

1. Verify the task using the task-specific checks from the plan.
2. Create exactly one commit for that completed task before starting any new task.
3. Create or update the log file for the phase you worked in.
4. Immediately append one task entry to the current phase log file.
5. Record the commit hash created for that task entry.
6. Record what the next worker must know.
7. Record any dependency changes or unresolved risks.
8. Record what was verified and what was not verified.

## How to Read Logs

Use the plan document first, then use the logs to understand dependency-sensitive context.

Reading order:

1. Identify the current task in `docs/implementation-plan-en.md`.
2. Note its dependencies.
3. Read the latest implementaion logs for:
   - the current phase
   - the phases containing those dependency tasks
4. Extract anything that affects:
   - file ownership
   - contracts
   - test assumptions
   - migration order
   - queue/state-machine behavior
   - follow-up work that was intentionally deferred
5. Apply those findings in the current task if they still matter.

If a previous log conflicts with the current plan or the source specs, do not silently follow the stale log. Note the conflict in the new log and follow the current source of truth.

## Relationship to the Plan

The plan document defines:

- phase order
- task dependencies
- acceptance criteria
- verification expectations

The implementaion logs add:

- what actually happened during each completed task within the phase
- what was learned that the next worker needs before starting the next task
- what changed from expectations for that specific task
- what remains risky or incomplete for downstream tasks

The logs must be written with explicit reference to the plan's phase and task numbers so future workers can trace dependency impact.

## File Naming

Prefer one markdown file per phase. Use this format(example):

- `phase-1-foundation.md`
- `phase-2-schema-and-security.md`
- `phase-3-domain-rpcs.md`
- `phase-4-async-ai-pipeline.md`
- `phase-5-final-product-and-ops.md`

One markdown file per phase does not mean one write per phase. A phase file should accumulate multiple task entries over time, with each entry appended immediately after its task is committed.

If a phase becomes too large, split by task group:

- `phase-3-domain-rpcs-task-8-9.md`
- `phase-3-domain-rpcs-task-10-11.md`

## Log Template

Each completed task must produce exactly one new log entry in the current phase file. Do not combine multiple completed tasks into one retrospective entry.

Use this template for each log entry inside a phase file:

```md
# Phase 3: Domain RPCs

## Entry: 2026-05-01 Task 9

**Worker context:**
- Phase: Phase 3
- Task: Task 9: Implement tank CRUD and timeline RPCs
- Dependencies reviewed:
  - Task 5
  - Task 7
  - Phase 2 log

**What was done:**
- [Short factual summary]
- [Short factual summary]

**Why it matters for the next worker:**
- [Contract, invariant, or behavior that future tasks depend on]
- [Constraint or caveat that should not be rediscovered]

**Dependency impact:**
- [What dependency was satisfied, changed, or introduced]
- [What downstream task is affected]

**Files touched:**
- `path/to/file`
- `path/to/test`

**Commit:**
- `abcdef1` [short hash or full hash for the task commit]

**Verification completed:**
- [ ] [Concrete test or command that passed]
- [ ] [Concrete manual or structural verification]

**Not verified:**
- [ ] [Anything intentionally left unverified]

**Design decisions:**
- [Choice made where the spec was silent or ambiguous, and the rationale]

**Deviations from spec:**
- [Where the implementation intentionally diverges from the spec and why]

**Trade-offs:**
- [Alternatives considered, current approach chosen, and why]

**Open questions:**
- [ ] [Unresolved question requiring confirmation or correction before the next worker proceeds]
- [x] [Resolved question] → [Brief explanation of how it was resolved]

**Open risks or follow-ups:**
- [Risk or follow-up item]

**Instructions for the next worker:**
- [What to read first]
- [What assumption is safe or unsafe]
- [What must be preserved]
```

## Writing Rules

- Write for the next worker, not for historical completeness.
- Focus on changes that affect the next task or any dependent task.
- Prefer concrete statements over narrative.
- Mention exact task numbers from the plan.
- Call out when a previous log influenced the current implementation.
- Call out when a previous log was intentionally not followed because the plan or source spec changed.
- Record unresolved issues clearly instead of burying them in prose.
- Do not delay task entries until the end of the phase.
- Do not batch multiple task commits and document them afterward as a group.
- If multiple tasks are completed in the same phase, append one entry per task in completion order.
- Record every design decision made where the spec was silent or ambiguous, with explicit rationale.
- Record every intentional deviation from the spec; never let a divergence go undocumented.
- Record trade-offs: list the alternatives that were considered and explain why the current approach was chosen.
- Record open questions immediately when they arise; do not defer them to the end of the phase.
- Before starting any task, verify that all open questions from the previous task log are resolved (`[x]`). If any remain unresolved (`[ ]`), stop immediately and report them to the user. Do not make any code changes until the user provides explicit resolution.
- When an open question is resolved, update its checkbox to `[x]` and append a brief inline note (after `→`) explaining how it was resolved.

## What Must Be Captured

Always capture:

- phase and task number
- dependencies reviewed before starting
- what was actually implemented or changed
- what downstream work is now unblocked
- what downstream work is still risky
- the commit hash created after the task
- what tests or checks were completed
- what the next worker must read before continuing
- design decisions made where the spec was silent or ambiguous
- intentional deviations from the spec and the reason for each
- trade-offs considered and why the current approach was chosen
- open questions that require confirmation or correction before the next task

A task is not considered closed for handoff purposes until both of the following exist:

- a dedicated commit for that task
- a matching task entry in the phase log with that commit hash

## What Not to Write

Do not write:

- low-signal command transcripts
- generic summaries like "implemented feature"
- restatements of the whole plan
- notes that have no bearing on the next worker
- combined retrospective entries that summarize multiple completed tasks as one unit

## Minimum Handoff Rule

If you changed anything in a phase, leave behind enough information that the next worker can continue without re-reading your diffs first.

If you completed a task, do not start the next task until the current task has:

- its own commit
- its own log entry in the current phase file
- its verification status recorded

If you completed a task, the log entry must include the commit hash for that task.

## Interpretation Guardrails

- Phase is a planning and file-grouping concept.
- Task is the execution, commit, and logging concept.
- A phase file may contain many task entries.
- A completed task must be committed and logged before the next task starts.
- End-of-phase retrospective logging is not an acceptable substitute for task-level logging.
