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
- Task commit created after this entry.

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
