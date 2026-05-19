# Phase 5: MCP / stdio interface

## Entry: 2026-05-19 Task 5.1

**Worker context:**
- Phase: Phase 5
- Task: Task 5.1: MCP stdio server and HTTP delegation
- Dependencies reviewed:
  - Task 4.5
  - Phase 4 LLM adapter and context builder log
  - Phase 3 SSE and EJS dashboard log
  - `docs/specs/06-mcp.md`
  - `docs/specs/09-cli.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added `llm-salon mcp` and `llm-salon mcp install-prompt` CLI commands.
- Added MCP stdio JSON-RPC handling over `@modelcontextprotocol/sdk` `StdioServerTransport`.
- Added HTTP delegation for `get_server_status` using the running-server lock and anonymous REST routes.
- Added JSON Schema input/output metadata for `get_server_status`, structured tool output, protocol-version negotiation, and clear tool errors when the HTTP server is not running.
- Added MCP stdio integration coverage that spawns the CLI child process and verifies `initialize`, `tools/list`, `tools/call`, and the install prompt.

**Why it matters for the next worker:**
- Task 5.2 can add tools behind the same stdio server and `McpHttpBridge` delegation path.
- MCP responses now support `structuredContent`; downstream tools should keep returning structured payloads plus text compatibility.
- Version lookup is package-root relative, so `llm-salon mcp` is safe when launched by an MCP host from another working directory.

**Dependency impact:**
- Satisfies Task 5.1 and unblocks Task 5.2 MCP tool implementation.
- Introduces `@modelcontextprotocol/sdk`.
- Keeps MCP child behavior dependent on a running HTTP server discovered through `~/.llm-salon/server.lock`.

**Files touched:**
- `package.json`
- `pnpm-lock.yaml`
- `src/cli/cli.module.ts`
- `src/cli/mcp.command.ts`
- `src/mcp/http-bridge.ts`
- `src/mcp/mcp.module.ts`
- `src/mcp/stdio-server.ts`
- `test/mcp.spec.ts`
- `test/test-prisma.ts`

**Commit:**
- `cce4f0f`

**Verification completed:**
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint "src/mcp/**/*.ts" "src/cli/**/*.ts" "test/mcp.spec.ts" "test/test-prisma.ts"`
- [x] `./node_modules/.bin/jest test/projects.spec.ts test/mcp.spec.ts --runInBand`
- [x] `./node_modules/.bin/nest build`
- [x] `node dist/cli/main.js mcp install-prompt`
- [x] `git diff --check`
- [x] Review subagent `gpt-5.4` reviewed Task 5.1, findings were addressed, and re-review reported no remaining blockers.

**Not verified:**
- [ ] Full repository test suite; validation was scoped to MCP, related project REST behavior, typecheck, lint, and build.
- [ ] Real installed global `llm-salon` binary invocation; built local `dist/cli/main.js` was smoke-tested instead.

**Design decisions:**
- `get_server_status.phase` uses the first topic returned by the existing project detail route. The spec does not define multi-topic precedence for this summary field.
- The low-level stdio server handles the minimal Task 5.1 JSON-RPC surface directly while still using the SDK transport; Task 5.2 can decide whether to move tool registration to the SDK high-level server API as tool count grows.

**Deviations from spec:**
- None.

**Trade-offs:**
- Kept HTTP delegation explicit through existing REST routes instead of importing domain services into MCP, matching Task 5.1 and preserving one internal API path.
- Kept build-output CLI coverage as a smoke command rather than making Jest depend on prebuilt `dist` artifacts.

**Open questions:**
- [x] Should `get_server_status.phase` use latest or active topic when a project has multiple topics? → Unspecified in `06-mcp.md`; Task 5.1 keeps the first topic from the existing project detail ordering and records this for future spec clarification.

**Open risks or follow-ups:**
- Task 5.2 must add anonymous response guard coverage across every MCP tool, not just `get_server_status`.
- If `get_server_status` becomes performance-sensitive with many projects, replace per-project detail HTTP calls with a dedicated REST status endpoint.

**Instructions for the next worker:**
- Start Task 5.2 by extending `src/mcp/stdio-server.ts` and `src/mcp/http-bridge.ts`.
- Preserve `structuredContent` output and JSON Schema metadata for each tool.
- Keep MCP stdio free of browser-facing SSE payloads; use anonymous REST/context paths only.

## Entry: 2026-05-19 Task 5.2

**Worker context:**
- Phase: Phase 5
- Task: Task 5.2: MCP tools + anonymization guard
- Dependencies reviewed:
  - Task 5.1
  - `docs/specs/02-domain-model.md`
  - `docs/specs/05-api.md`
  - `docs/specs/06-mcp.md`
  - `docs/specs/07-llm-integration.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added MCP tool metadata and dispatch for all Phase 5 tools:
  - `create_project`
  - `get_server_status`
  - `get_project_status`
  - `join_project`
  - `create_topic`
  - `add_document`
  - `get_context`
  - `get_turn`
  - `is_my_turn`
  - `submit_message`
  - `get_report_status`
- Added HTTP bridge delegation for each MCP tool through anonymous REST routes.
- Added REST support needed by MCP for inline text documents, context payload retrieval, current-turn status, and report status.
- Added a persisted `Topic.version` counter and migration so volatile MCP responses expose a monotonic `topicVersion`.
- Added initial turn creation when a topic is created after participants have joined, enabling the scripted join -> context -> submit MCP flow.
- Preserved structured MCP error responses, including `WRONG_TURN` with the current anonymous member.
- Extended anonymous guard allowlist only for the new anonymous MCP/context response keys.
- Added MCP stdio integration coverage for the full tool flow, wrong-turn handling, inline document rejection, project-level documents, and `topicVersion` changes.

**Review feedback addressed:**
- Review subagent `gpt-5.4` identified four issues:
  - timestamp-derived `topicVersion`
  - `get_project_status` omitting project-level documents
  - inline document guard rejecting valid text that starts with a path-like phrase
  - new REST controllers not accepting the shared audience query contract
- All review findings were addressed before final validation.

**Dependency impact:**
- Satisfies Task 5.2 and completes the Phase 5 checkpoint.
- Adds Prisma migration `0003_topic_version`; deployments must run Prisma migrate before using the new code against a persistent database.
- MCP remains dependent on a running local HTTP server discovered through the server lock.

**Files touched:**
- `prisma/schema.prisma`
- `prisma/migrations/0003_topic_version/migration.sql`
- `src/app.module.ts`
- `src/common/dto/anonymous.ts`
- `src/common/dto/human.ts`
- `src/common/errors/domain-exception.filter.ts`
- `src/common/errors/domain.errors.ts`
- `src/common/interceptors/anonymous-guard.interceptor.ts`
- `src/documents/*`
- `src/mcp/*`
- `src/messages/messages.service.ts`
- `src/prompt/context.controller.ts`
- `src/prompt/context-payload.service.ts`
- `src/prompt/prompt.module.ts`
- `src/reports/*`
- `src/topics/dto/create-topic.dto.ts`
- `src/topics/topics.service.ts`
- `src/turns/turn-engine.service.ts`
- `src/turns/turn.presenter.ts`
- `src/turns/turns.controller.ts`
- `src/turns/turns.module.ts`
- `src/turns/turns.service.ts`
- `test/*`

**Commit:**
- `f7a4577`

**Verification completed:**
- [x] `./node_modules/.bin/prisma generate`
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint "src/mcp/**/*.ts" "src/documents/**/*.ts" "src/turns/**/*.ts" "src/reports/**/*.ts" "src/prompt/**/*.ts" "src/common/**/*.ts" "src/topics/**/*.ts" "src/messages/**/*.ts" "src/app.module.ts" "test/mcp.spec.ts" "test/test-prisma.ts" "test/projects.spec.ts" "test/messages.spec.ts" "test/sse.spec.ts" "test/auto-speak.spec.ts"`
- [x] `./node_modules/.bin/jest test/mcp.spec.ts --runInBand`
- [x] `./node_modules/.bin/jest test/projects.spec.ts test/messages.spec.ts test/mcp.spec.ts test/sse.spec.ts test/auto-speak.spec.ts src/common/__tests__/anonymous-guard.spec.ts --runInBand`
- [x] `./node_modules/.bin/jest --runInBand`
- [x] `./node_modules/.bin/nest build`
- [x] `git diff --check`
- [x] Review subagent `gpt-5.4` reviewed Task 5.2 and findings were addressed.

**Not verified:**
- [ ] Real external LLM provider calls; Phase 5 MCP flow does not require provider API calls.
- [ ] Real installed global `llm-salon` binary invocation; MCP stdio coverage uses the local child process path.

**Design decisions:**
- `Topic.version` is incremented by domain writes that create messages, advance turns, or change topic phase/current-turn state. MCP exposes this as `topicVersion`.
- `get_project_status` returns both project-level documents and the selected topic's documents so its document view matches `get_context`.
- `add_document` accepts only inline UTF-8 text through MCP. It rejects NUL-containing content and bare path strings, but allows normal prose or snippets that merely mention path-like text.
- Context payloads remain anonymized even when the REST endpoint receives `audience=human`, because the context route is LLM-facing by design.

**Deviations from spec:**
- None requiring user decision.

**Trade-offs:**
- Added small REST endpoints to support MCP delegation instead of importing Nest services directly into the stdio process.
- Kept report status anonymous payload minimal for MCP; human-only REST responses may include `filePath` and `draftPreview`.

**Open questions:**
- [x] Should `get_context(projectId, topicId)` require `participantId`? → `06-mcp.md` defines only `projectId` and `topicId`; implementation chooses the current turn participant, falling back to the first active/waiting participant when no turn exists.
- [x] Should inline document input support file upload paths? → No. Task 5.2 requires inline text body only and rejects bare file paths.

**Open risks or follow-ups:**
- Phase 6 report generation will need to populate report rows/files consumed by `get_report_status`.
- If multi-topic MCP status selection needs a user-facing policy, add it to `06-mcp.md`; Phase 5 keeps the existing first-topic status behavior from Task 5.1.

## Checkpoint: Phase 5

- [x] LLM app completes join -> context -> submit via MCP (scripted).
- [x] Anonymization guard regressions still pass.
