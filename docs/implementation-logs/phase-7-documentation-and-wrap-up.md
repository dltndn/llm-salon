# Phase 7: Documentation and wrap-up

## Entry: 2026-05-20 Task 7.1

**Worker context:**
- Phase: Phase 7
- Task: Task 7.1 — English README + user guide
- Dependencies reviewed:
  - Task 6.3 (`phase-6-report-pipeline.md`)
  - `docs/specs/00-overview.md`
  - `docs/specs/05-api.md`
  - `docs/specs/06-mcp.md`
  - `docs/specs/08-security.md`
  - `docs/specs/09-cli.md`

**What was done:**
- Added English `README.md` with install, env setup, local PostgreSQL setup, start flow, first-message self-check, provider registration, MCP install prompt, and local-only/security constraints.
- Added `docs/user-guide.md` with a longer local setup and operations guide.
- Added `projectId` to `get_server_status()` MCP output so MCP apps can join an existing running project using the spec-defined `join_project(projectId, ...)` flow.
- Updated MCP tool schema, HTTP bridge response, spec text, and MCP integration test for the `projectId` status contract.
- Completed the requested gpt-5.4 subagent review loop and addressed all blocker feedback.

**Why it matters for the next worker:**
- A fresh user can follow the README from install/configuration to `llm-salon start`, create a participant/topic through REST, and submit the first topic message.
- MCP apps now have a documented path from `get_server_status()` to `join_project()` for existing running projects.
- README explicitly states single-user, `127.0.0.1` only, no-auth MVP constraints, `.env` API key handling, and `chmod 600 ~/.llm-salon/.env`.

**Dependency impact:**
- Satisfies Task 7.1 acceptance criteria.
- Task 7.2 can use the README/security wording as the baseline for logging masking and error mapping audit notes.

**Files touched:**
- `README.md`
- `docs/user-guide.md`
- `src/mcp/http-bridge.ts`
- `src/mcp/tools.ts`
- `test/mcp.spec.ts`

**Commit:**
- `3aed9b4`

**Verification completed:**
- [x] `git diff --check`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint "{src,test}/**/*.ts"`
- [x] `./node_modules/.bin/ts-node -r tsconfig-paths/register src/cli/main.ts mcp install-prompt`
- [x] `./node_modules/.bin/jest test/mcp.spec.ts --runInBand` (passed with local 127.0.0.1 binding allowed)
- [x] gpt-5.4 subagent review reported no remaining blockers after fixes

**Not verified:**
- [ ] Full repository test suite
- [ ] Live README self-check against a real PostgreSQL database

**Design decisions:**
- README self-check uses REST JSON responses instead of parsing human-oriented CLI output, so it can capture `participantId` and `topicId` deterministically.
- The self-check registers a manual app participant before creating the first topic because topic creation only creates an initial turn when a participant already exists.
- `get_server_status()` now includes `projectId` rather than documenting slug-as-id behavior for `join_project()`.

**Deviations from spec:**
- `get_server_status()` now returns `projectId` in implementation and tool schema, but `docs/specs/06-mcp.md` remains ignored and untracked by request.

**Trade-offs:**
- The README uses `curl` plus Node one-liners for a deterministic local self-check instead of relying only on CLI commands whose output is not specified for machine parsing.
- The MCP status response change is additive and keeps existing fields unchanged.

**Open questions:**
- [x] How should MCP apps join an existing project discovered from `get_server_status()`? → `get_server_status()` now returns `projectId` for each project.

**Open risks or follow-ups:**
- `docs/` is ignored by `.gitignore`; `docs/specs/06-mcp.md` is intentionally not tracked, while `docs/user-guide.md` remains force-added as a deliverable.
- Full suite and live PostgreSQL install walkthrough remain useful before a release tag.

**Instructions for the next worker:**
- Start Task 7.2 by reading this log and `README.md`.
- Preserve the `get_server_status().projects[].projectId` contract unless replacing it with another spec-backed app registration path.
