# Worklog: Participant Activation On First Turn

Date: 2026-05-28
Status: Done

Related proposal:
- `docs/proposals/003-participant-activation-on-first-turn.md`

Related decision:
- `docs/decisions/ADR-003-participant-activation-on-first-turn.md`

Related specs:
- `docs/specs/02-domain-model.md`
- `docs/specs/10-testing.md`

## Summary

Implemented forward-only participant activation when a waiting participant receives their first assigned turn. The change keeps active-only downstream rules intact while preventing current-round waiting participants from being skipped by consensus early stop before their first turn.

## Changed

- Promoted the initial topic turn holder from `waiting` to `active` in the same transaction as topic and first-turn creation.
- Promoted later waiting turn holders from `waiting` to `active` in the same transaction as planned turn creation.
- Preserved consensus early stop for active participants while blocking early stop when a current-round waiting participant has not yet received their first turn.
- Added regression coverage for initial-turn activation, planned-turn activation, and first-turn preservation before consensus early stop.
- Added regression coverage for mid-round waiting arrivals and forward-only no-backfill behavior where a waiting participant already has an assigned turn history.
- Added domain glossary entries for participant lifecycle terminology.
- Addressed `gpt-5.4` review feedback for legacy waiting participants, API/MCP spec alignment, and missing edge-case coverage.

## Verification

- `pnpm test -- src/turns/__tests__/turn-engine.service.spec.ts`
- `pnpm test -- test/projects.spec.ts`
- `pnpm test -- test/messages.spec.ts --runInBand`
- `pnpm test -- test/turn-wait.spec.ts --runInBand`
- `pnpm test -- test/mcp.spec.ts --runInBand`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm test`
- `gpt-5.4` subagent code review repeated until no findings

## Notes

- No data backfill was added because there is no existing user data to migrate.
- Mid-round waiting arrivals remain excluded from consensus early-stop blocking until they enter the next round.
