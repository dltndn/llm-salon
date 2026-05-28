# Proposal 003: Participant Activation On First Turn

Status: Implemented
Owner: Codex
Created: 2026-05-27
Related analysis:
- Local Codex investigation on 2026-05-27 covering `waiting` participants that can speak but do not satisfy `active`-only downstream rules

Related specs:
- `docs/specs/02-domain-model.md`
- `docs/specs/10-testing.md`

Related decision:
- `docs/decisions/ADR-003-participant-activation-on-first-turn.md`

Related worklog:
- `docs/worklogs/2026-05-28-participant-activation-on-first-turn.md`

## Summary

Define a missing automatic `waiting -> active` transition so a participant becomes `active` at the moment their first turn row is created. This keeps the current meaning of `active` intact while removing the inconsistent state where a participant can already debate but is still excluded from `active`-only rules such as consensus early stop, review completion, and reporter selection.

## Problem

Current behavior and current spec language are misaligned in practice:

- participants are registered as `waiting`
- round-robin turn selection already treats `waiting` participants as eligible candidates
- consensus early stop counts only `active` participants
- reviewing completion and reporter selection also depend on `active`

That creates a broken intermediate state:

- a `waiting` participant can receive a debate turn and submit messages
- the same participant does not count toward "all active participants" checks
- if all debating participants remain `waiting`, consensus early stop can never trigger because the counted set is empty

This is not a request to redefine `active`. The problem is that the system never clearly says when a participant stops being merely registered and starts being an actual active debate member.

## Scope

- Included:
- Define the automatic `waiting -> active` promotion rule.
- Keep `participant.status` as the existing project-level field.
- Make promotion happen only when that participant's own first turn row is created.
- Require the promotion to occur in the same transaction as first-turn creation.
- Keep downstream `active`-only semantics unchanged.
- Add regression coverage for promotion timing and the restored early-stop/review behavior.

- Excluded:
- A topic-specific participant-state model.
- Changing consensus early stop to include `waiting`.
- Changing reporter or review logic to include `waiting`.
- Demoting participants from `active` back to `waiting`.
- Manual activation controls in the UI, HTTP API, or MCP tools.

## Proposed Change

### 1. Define `active` as "has entered the actual turn rotation"

Keep the existing distinction:

- `waiting` means registered but not yet in the actual turn rotation for this project
- `active` means the participant has been inserted into the turn rotation and should count for active-only downstream rules

This proposal does not redefine `inactive` or `removed`.

### 2. Promote on first turn creation, not on registration or first message

Promotion rule:

- when the system creates the participant's first `turn` row in a topic, and the participant is still `waiting`, the system updates that participant to `active`
- this applies only to that participant, not to all current candidates in the round
- if the participant is already `active`, no change occurs

Why this timing:

- earlier than first message, so downstream logic sees a participant as active as soon as they are formally inserted into debate orchestration
- later than registration, so mid-round joiners can still remain `waiting` until the next round actually starts using them
- narrower than round-wide batch activation, so late joiners are not promoted before they truly enter the rotation

### 3. Make promotion one-way

The new transition is:

- `waiting -> active`

It is not reversible back to `waiting`.

If a participant must later stop participating, existing `inactive` or `removed` states remain the proper mechanisms.

### 4. Keep promotion atomic with first-turn creation

When a participant's first turn row is created, the system must:

1. create the turn row
2. promote the participant from `waiting` to `active` if needed
3. commit both changes in the same DB transaction

This avoids the inconsistent window where a first turn exists but the participant is still `waiting`.

### 5. Keep downstream `active` semantics unchanged

After this proposal:

- consensus early stop continues to count only `active` participants
- current-round `waiting` participants block consensus early stop until their first assigned turn is created
- reviewing completion continues to require feedback from all `active` participants
- reporter selection continues to choose from `active` provider participants

The fix is to ensure that the right participants become `active` at the right time, not to broaden those rules to `waiting`.

## User-Visible Effects

- participants who actually enter the debate rotation count immediately toward consensus readiness
- debates no longer get stuck in `debating` merely because all speakers still carry `waiting` status
- review completion and reporter selection become consistent with the set of participants who have actually been given turns

## Affected Documents

- `docs/specs/02-domain-model.md`
  Clarify the precise meaning of `waiting` and `active`, and define the automatic promotion rule tied to first-turn creation.
- `docs/specs/10-testing.md`
  Add regression cases for first-turn activation and for `active`-dependent flows that rely on the promotion.

## Alternatives Considered

### Option A: Count `waiting` participants everywhere that currently counts `active`

Rejected as the primary design.

Pros:

- smaller immediate code change in some call sites
- would unblock consensus early stop quickly

Cons:

- weakens the meaning of `active`
- leaves participant lifecycle under-specified
- broadens review and reporter rules in ways that are harder to reason about

### Option B: Promote to `active` immediately on registration

Rejected as the primary design.

Pros:

- simple rule
- avoids downstream empty-set problems

Cons:

- conflicts with the current meaning of `waiting`
- makes mid-round joiners appear active before they have actually entered rotation
- blurs the distinction between "registered" and "in play"

### Option C: Add a topic-specific participant state model

Rejected for this proposal.

Pros:

- more precise representation of per-topic participation
- cleaner long-term semantics if project membership and topic membership diverge further

Cons:

- materially larger schema and implementation change
- unnecessary for fixing the current inconsistency
- expands scope beyond the smallest safe correction

### Option D: Promote only when the participant's first turn row is created

Recommended.

Pros:

- preserves current state meanings
- aligns status with actual orchestration entry
- restores correctness for `active`-based rules without broadening them
- keeps the fix local and transactionally enforceable

Cons:

- requires touching turn creation logic
- depends on first-turn creation paths being centralized or consistently updated

## Risks

- A first-turn creation path may forget to apply the promotion.
- Mitigation: define the rule in the spec and add regression tests around turn creation and affected phase transitions.

- Existing data may contain long-lived `waiting` participants that already have historic turns.
- Mitigation: implementation should decide whether to backfill those rows or treat the fix as forward-only; that decision can be recorded in the related ADR/worklog.

- Project-level status may still feel coarse for future multi-topic participation features.
- Mitigation: keep this proposal scoped to the current bug and revisit topic-level state only when a concrete product need appears.

## Acceptance Notes

Before this proposal is accepted, the repository should agree that:

- `participant.status` remains a project-level field
- `active`-only downstream rules stay unchanged
- promotion occurs on first turn creation, not on registration or first message
- promotion is one-way and transactionally coupled to first-turn creation

Before this proposal is reflected in live specs, the following should be true:

- `docs/specs/02-domain-model.md` defines the promotion rule explicitly
- `docs/specs/10-testing.md` requires regression coverage for first-turn activation
- implementation work identifies all first-turn creation paths that must apply the same rule

## Status History

- 2026-05-27: Draft created to resolve the mismatch between turn eligibility and `active`-only downstream behavior.
- 2026-05-28: Accepted and implemented as a forward-only activation rule without data backfill.
