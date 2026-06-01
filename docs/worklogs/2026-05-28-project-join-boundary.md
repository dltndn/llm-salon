# Worklog: Project Join Boundary

Date: 2026-06-01
Status: Done

Related proposal:
- `docs/proposals/005-project-join-boundary.md`

Related decision:
- `docs/decisions/ADR-006-project-join-boundary.md`

Related specs:
- `docs/specs/00-overview.md`
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/07-llm-integration.md`
- `docs/specs/09-cli.md`
- `docs/specs/10-testing.md`
- `docs/user-guide.md`

## Summary

Implemented the project join boundary for MCP app participants. Joining a project remains registration-only, and no-topic project status is now a normal idle state instead of an MCP tool error.

## Changed

- Updated MCP `get_project_status` so projects with no topic return null topic-scoped fields, anonymized participants, project-level documents, `serverTime`, and `topicVersion: null`.
- Preserved project-not-found errors and left `join_project`, `create_topic`, `add_document`, and `submit_message` as separate explicit actions.
- Updated `llm-salon mcp install-prompt` to tell apps to stop after join plus project status when no topic exists.
- Updated dashboard project/topic MCP prompt-copy text to separate project onboarding from topic participation.
- Added regression coverage for no-topic status, join-only idle behavior, install prompt guidance, dashboard prompt copy, and dashboard view prompt text.
- Promoted Proposal 005 into accepted specs and recorded ADR-006 before implementation.

## Files Or Areas Touched

- `src/mcp/http-bridge.ts`
- `src/cli/mcp.command.ts`
- `src/common/mcp-prompt-copy.ts`
- `test/mcp.spec.ts`
- `test/dashboard-management.spec.ts`
- `test/views.spec.ts`
- `docs/proposals/005-project-join-boundary.md`
- `docs/decisions/ADR-006-project-join-boundary.md`
- `docs/specs/`
- `docs/user-guide.md`

## Verification

- Completed:
- `pnpm test -- test/mcp.spec.ts test/dashboard-management.spec.ts test/views.spec.ts`
- `pnpm typecheck`
- Code review after implementation found no required fixes.

- Not completed:
- Full `pnpm test` was not run; targeted MCP, dashboard prompt, view coverage, and typecheck were run for this scoped change.

## Risks Or Follow-ups

- General-purpose LLM apps may still ignore the prompt guidance; the boundary is enforced by status behavior and documented prompt contracts, not by removing MCP tool capabilities.
- Future app-action work such as `wait_for_action` must preserve the distinction between project-level onboarding and topic-level participation.
