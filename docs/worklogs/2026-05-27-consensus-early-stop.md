# Worklog: Consensus Early Stop

Date: 2026-05-27
Status: Done

Related proposal:
- `docs/proposals/002-consensus-early-stop.md`

Related decision:
- `docs/decisions/ADR-002-consensus-early-stop.md`

Related specs:
- `docs/specs/00-overview.md`
- `docs/specs/02-domain-model.md`
- `docs/specs/04-database.md`
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/07-llm-integration.md`
- `docs/specs/10-testing.md`

## Summary

Implemented explicit consensus early stop for `consensus` topics using a persisted `debate_signal` on messages. The topic now enters `drafting` before turn or round limits when every active participant's latest debating `statement` signal is `ready_to_finalize`.

## Changed

- Added the `debate_signal` PostgreSQL enum and `messages.debate_signal` column.
- Extended HTTP and MCP message submission with optional `debateSignal`, defaulting omitted values to `continue`.
- Added server-side readiness evaluation after each debate `statement`.
- Preserved `options` mode behavior so readiness signals do not early-stop options topics.
- Updated provider auto-speak to accept structured `{ content, debateSignal }` output while keeping plain-text provider output compatible as `continue`.
- Updated LLM context and system guidance to include debate readiness behavior.
- Added targeted tests for unanimous readiness, continue reset, options-mode exclusion, and provider structured output.
- Addressed `gpt-5.4` review feedback by making app context request structured `{ content, debateSignal }` output, accepting fenced/prefaced provider JSON, and adding MCP plus wait wakeup coverage.

## Verification

- `pnpm prisma generate`
- `pnpm typecheck`
- `pnpm test -- test/messages.spec.ts`
- `pnpm test -- test/messages.spec.ts test/auto-speak.spec.ts test/mcp.spec.ts src/prompt/__tests__/context-builder.service.spec.ts`
- `pnpm test -- test/turn-wait.spec.ts test/mcp.spec.ts test/auto-speak.spec.ts src/prompt/__tests__/context-builder.service.spec.ts`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

## Notes

- Existing clients that do not send `debateSignal` remain compatible and behave as `continue`.
- Provider plain-text output remains compatible but cannot trigger early stop unless the provider returns the documented structured JSON object.
