# ADR-003: Participant Activation On First Turn

Status: Accepted
Date: 2026-05-28
Related proposal:
- `docs/proposals/003-participant-activation-on-first-turn.md`

Related specs:
- `docs/specs/02-domain-model.md`
- `docs/specs/10-testing.md`

Related worklog:
- `docs/worklogs/2026-05-28-participant-activation-on-first-turn.md`

## Context

Participants are registered as `waiting`, but turn selection can still assign turns to both `waiting` and `active` participants. Downstream rules such as consensus early stop, reviewing completion, and reporter selection count only `active` participants.

Without a precise promotion rule, a participant can speak while still being excluded from active-only rules. That makes consensus and review behavior depend on an inconsistent participant lifecycle state.

## Options Considered

### Count `waiting` participants in active-only rules

- Pros:
- Small immediate change at some call sites.
- Avoids empty active-set problems.

- Cons:
- Weakens the meaning of `active`.
- Spreads lifecycle ambiguity into consensus, review, and reporter rules.

### Promote participants on registration

- Pros:
- Simple rule.
- Avoids later promotion logic.

- Cons:
- Makes mid-round joiners active before they enter the turn rotation.
- Blurs registered membership with actual debate participation.

### Promote participants when their first assigned turn is created

- Pros:
- Aligns status with actual entry into turn rotation.
- Keeps active-only downstream rules unchanged.
- Allows mid-round joiners to remain waiting until their next-round turn is actually created.

- Cons:
- Requires every first-turn creation path to apply the same promotion.
- Requires consensus early stop to preserve the first-turn opportunity for current-round waiting participants.

## Decision

Promote a participant from `waiting` to `active` when their first assigned debate turn row is created. The promotion is one-way and occurs in the same transaction as turn creation.

Existing user data does not require backfill for this implementation, so the change is forward-only.

Consensus early stop continues to count only `active` participants, but a `waiting` participant that was already part of the current round blocks early stop until their first assigned turn is created.

## Consequences

- Participants count for active-only rules once the system has actually inserted them into turn rotation.
- Mid-round joiners do not block consensus early stop before their next round.
- Initial and current-round participants are not skipped by early stop before their first turn.
- Future turn creation paths must preserve the transactionally coupled activation rule.
