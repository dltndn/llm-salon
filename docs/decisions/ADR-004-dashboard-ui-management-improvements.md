# ADR-004: Dashboard UI Management Improvements

Status: Accepted
Date: 2026-06-01
Related proposal:
- `docs/proposals/004-dashboard-ui-management-improvements.md`

Related specs:
- `docs/specs/02-domain-model.md`
- `docs/specs/04-database.md`
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/10-testing.md`

Related worklog:
- `docs/worklogs/2026-06-01-dashboard-ui-management-improvements.md` (planned)

## Context

The dashboard is the human operator's main view of project state, but several management tasks are awkward or impossible: participants are hidden when no topic exists, message history does not show the anonymous member label used by LLM-facing flows, project and topic UUIDs require manual extraction, participants cannot be removed from future participation, and obsolete topics cannot be hidden without deleting records.

These improvements affect several boundaries: human UI rendering, REST management actions, participant lifecycle rules, topic visibility, database schema, and MCP onboarding guidance. The core debate orchestration and LLM-facing anonymization contracts should remain unchanged.

## Options Considered

### Display-only dashboard changes

- Pros:
- Low implementation risk.
- Improves message readability and onboarding copy.

- Cons:
- Leaves operators unable to remove participants or hide obsolete topics.
- Does not solve participant visibility before the first topic unless the dashboard layout changes.

### Hard-delete participants and topics

- Pros:
- Simple surface model for the UI.

- Cons:
- Breaks history preservation, auditability, report references, and anonymous-name non-reuse semantics.
- Conflicts with the existing participant lifecycle and topic/report retention expectations.

### Soft management actions

- Pros:
- Preserves messages, turns, documents, reports, and anonymous-name history.
- Reuses `participant.status = removed` for participant removal.
- Separates topic lifecycle phase from topic dashboard visibility through `topics.deleted_at`.

- Cons:
- Adds filtering responsibility to normal dashboard and project-detail paths.
- Requires explicit guards so active orchestration is not interrupted.

## Decision

Implement the dashboard management improvements as soft management actions plus scoped human UI enhancements:

- Message headers in the human dashboard may show `displayName` with the participant's anonymous label in parentheses.
- The project participant list is a project-level dashboard section and remains visible even when no topic exists.
- The dashboard surfaces shortened project and selected-topic UUIDs, with copy actions for raw UUIDs and fixed English MCP prompts.
- Participant removal updates `participant.status` to `removed`; it never deletes participant rows or history.
- The current in-progress turn holder cannot be removed.
- Topic hiding sets `topics.deleted_at`; it never deletes topic rows or child records.
- Hidden topics are excluded from normal dashboard topic tabs, default selected-topic resolution, and default project-detail topic lists.
- Topics may be hidden only in `preparing`, `finalized`, or `closed`.
- No dashboard restore/re-show path is included in this decision.

## Consequences

- Human operators can manage clutter and future participation without losing history.
- Existing LLM-facing anonymization rules remain intact because the new anonymous label display is human-dashboard-only.
- Implementations must filter hidden topics consistently on default human-facing project flows.
- Internal and explicit topic access paths may still read hidden topic records for preservation, debugging, or future restore work.
- Future contributors must not treat `deleted_at` as destructive deletion.
