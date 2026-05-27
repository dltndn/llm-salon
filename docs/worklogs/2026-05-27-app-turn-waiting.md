# Worklog: App Participant Turn Waiting

Date: 2026-05-27
Status: Done
Related proposal:
- `docs/proposals/001-app-turn-waiting.md`

Related decision:
- `docs/decisions/ADR-001-app-turn-waiting.md`

Related specs:
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/07-llm-integration.md`
- `docs/specs/10-testing.md`

## Change Summary

- Added the HTTP `GET /api/projects/:slug/topics/:topicId/turn/wait` endpoint.
- Added the MCP `wait_for_turn` tool and HTTP bridge delegation.
- Added bounded long-poll behavior with a default and maximum timeout of `30000` milliseconds.
- Added event wakeups for message creation, turn changes, topic phase changes, and project close events.
- Treated `reviewing` as actionable for active participants that have not yet submitted feedback.
- Updated proposal status to `Implemented`.

## Files Or Areas Touched

- `src/turns/`
- `src/mcp/`
- `src/common/interceptors/anonymous-guard.interceptor.ts`
- `test/turn-wait.spec.ts`
- `test/mcp.spec.ts`
- `test/test-prisma.ts`
- `docs/proposals/001-app-turn-waiting.md`

## Verification

- Completed:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test -- test/turn-wait.spec.ts`
- `pnpm test -- test/mcp.spec.ts`

- Not completed:
- Full `pnpm test` was not run; targeted REST and MCP coverage plus typecheck/lint were run for this implementation slice.

## Risks Or Follow-ups

- The wait endpoint returns on same-topic events even when `afterTopicVersion` is omitted, so clients should still inspect `isMyTurn`, `phase`, and `wakeupReason`.

## Notes For Next Work

- Read `docs/specs/05-api.md` and `docs/specs/06-mcp.md` before changing the wait contract.
- Preserve the `reviewing` behavior: active participants without feedback are considered actionable even though there is no round-robin turn row for feedback.
