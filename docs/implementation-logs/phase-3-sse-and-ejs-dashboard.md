# Phase 3: SSE and EJS dashboard

## Entry: 2026-05-18 Task 3.1

**Worker context:**
- Phase: Phase 3
- Task: Task 3.1: Domain events -> SSE multiplexer
- Dependencies reviewed:
  - Task 2.3
  - Phase 2 log
  - `docs/specs/02-domain-model.md`
  - `docs/specs/03-modules.md`
  - `docs/specs/05-api.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added `sse/` module with `/projects/:slug/events` SSE endpoint.
- Added `SseBroadcasterService` that subscribes to `DomainEventBus`, fans out by project slug, assigns per-project event IDs, and keeps a 100-event reconnect queue.
- Added `Last-Event-ID` replay that sends only later events and avoids replay/live handoff drops with buffering and deduping.
- Extended domain event payload types to include `projectSlug` and required human-facing display names for SSE-backed message and turn events.
- Updated message submission events to include display names needed by the browser-facing SSE contract.
- Added Supertest coverage for stream delivery, reconnect replay, queue cap, all seven API SSE event types, and REST message submission -> SSE delivery.

**Why it matters for the next worker:**
- Task 3.2 can subscribe browser JavaScript to `/projects/:slug/events` and consume the API event names from `05-api.md` directly.
- SSE is intentionally human-facing and emits `displayName`; it must not be reused for MCP or LLM-facing anonymous channels.
- The project still uses the existing Phase 2 `DomainEventBus` abstraction. `@nestjs/event-emitter` / `EventEmitter2` is not currently installed, so a literal EventEmitter2 migration remains separate dependency work if required.

**Dependency impact:**
- Satisfies Task 3.1 and unblocks Task 3.2 dashboard SSR/client work.
- Adds the SSE module to `AppModule`.
- Introduces required `projectSlug` and display-name fields for future domain events that should reach SSE.

**Files touched:**
- `src/app.module.ts`
- `src/events/domain-events.ts`
- `src/events/event-bus.ts`
- `src/messages/messages.service.ts`
- `src/sse/*`
- `test/messages.spec.ts`
- `test/sse.spec.ts`

**Commit:**
- `ab4288b`

**Verification completed:**
- [x] `./node_modules/.bin/jest test/sse.spec.ts --runInBand` with elevated permission for Supertest listener binding
- [x] `./node_modules/.bin/jest test/messages.spec.ts test/sse.spec.ts --runInBand` with elevated permission for Supertest listener binding
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint src/app.module.ts src/events src/messages src/sse test/messages.spec.ts test/sse.spec.ts`
- [x] `./node_modules/.bin/nest build`
- [x] `git diff --check`
- [x] `gpt-5.4` subagent review completed; findings were addressed and re-review reported no remaining blockers.

**Not verified:**
- [ ] Literal `pnpm` commands, because `pnpm` is not available on this shell PATH.
- [ ] DB-backed SSE integration, because the current regression uses in-memory Prisma doubles and no `DATABASE_URL` is set for the opt-in DB lane.

**Open risks or follow-ups:**
- If strict EventEmitter2 conformance is required, add the Nest event-emitter dependency and migrate `DomainEventBus` in a focused follow-up.
- Future domain event emitters for participants/reports/project close must populate the required `projectSlug` and human-facing fields used by SSE.

**Instructions for the next worker:**
- For Task 3.2, use `/projects/:slug/events` from vanilla browser JavaScript and handle the exact event names in `docs/specs/05-api.md`.
- Keep SSE payloads human-facing; do not route these events into MCP or prompt context.
- Preserve the 100-event replay cap and `Last-Event-ID` semantics when adding dashboard behavior.

## Entry: 2026-05-18 Task 3.2

**Worker context:**
- Phase: Phase 3
- Task: Task 3.2: EJS dashboard SSR + vanilla JS/CSS
- Dependencies reviewed:
  - Task 3.1
  - Phase 3 log
  - `docs/specs/03-modules.md`
  - `docs/specs/05-api.md`
  - `docs/specs/10-testing.md`

**What was done:**
- Added `GET /` project index and `GET /projects/:slug` project dashboard routes.
- Added local `.ejs` template rendering with project index, dashboard layout, topic selector, participant panel, message list, document area, and report draft/final area.
- Added static asset route for `public/styles.css` and `public/dashboard.js`, resolved relative to the packaged module path rather than the caller's `cwd`.
- Added vanilla browser SSE client that subscribes to `/projects/:slug/events`, appends new messages, updates phase, updates current-turn summary, highlights the current participant, and auto-scrolls the message list.
- Added dashboard styling without pagination, mobile scope, or dark mode.
- Added Nest build asset configuration so `.ejs` templates are copied to `dist`.
- Added Supertest coverage for SSR output, Human DTO display names, report populated/empty states, static assets, static assets outside repo `cwd`, and missing project 404.

**Why it matters for the next worker:**
- Phase 4 provider auto-speak can rely on the browser dashboard updating from existing SSE events without a page refresh.
- The dashboard is human-facing and intentionally renders `displayName`, not anonymous-only names.
- Static assets are served by the local Nest app through a small whitelist, not through a separate asset server.

**Dependency impact:**
- Satisfies Task 3.2 and completes Phase 3 implementation.
- Adds `ViewsController`, `ViewsService`, and `EjsRendererService` to `AppModule`.
- Adds `public/` as the browser asset location for the current no-bundler frontend.

**Files touched:**
- `nest-cli.json`
- `src/app.module.ts`
- `src/http/ejs-renderer.service.ts`
- `src/http/views.controller.ts`
- `src/http/views.service.ts`
- `src/http/views/*`
- `public/dashboard.js`
- `public/styles.css`
- `test/views.spec.ts`

**Commit:**
- `76e265d`

**Verification completed:**
- [x] `./node_modules/.bin/jest test/views.spec.ts --runInBand` with elevated permission for Supertest listener binding
- [x] `./node_modules/.bin/jest test/views.spec.ts test/sse.spec.ts test/messages.spec.ts --runInBand` with elevated permission for Supertest listener binding
- [x] `./node_modules/.bin/jest --runInBand` with elevated permission for Supertest listener binding
- [x] `./node_modules/.bin/tsc --noEmit`
- [x] `./node_modules/.bin/eslint "{src,test}/**/*.ts"`
- [x] `./node_modules/.bin/nest build`
- [x] `git diff --check`
- [x] Browser check: opened a temporary local dashboard, submitted a message via REST, and verified the browser appended the new message through SSE and updated the current-turn summary.
- [x] `gpt-5.4` subagent review completed; findings were addressed and re-review reported no remaining code blockers.

**Not verified:**
- [ ] Literal `pnpm` commands, because `pnpm` is not available on this shell PATH.
- [ ] Real PostgreSQL-backed dashboard rendering, because the tests and browser check used in-memory Prisma doubles.
- [ ] Real CLI `llm-salon start` browser auto-launch with a database-backed project, because no `DATABASE_URL` is set in this shell.

**Open risks or follow-ups:**
- The EJS renderer is intentionally minimal and only supports the syntax used by local trusted templates.
- Dashboard document/report content is read-only until later document/report pipeline tasks add full APIs.
- If strict EventEmitter2 conformance is required, migrate `DomainEventBus` in a focused follow-up with the needed dependency.

**Instructions for the next worker:**
- For Phase 4, preserve existing SSE event names and payload shapes so the dashboard continues to update without client changes.
- Do not route dashboard SSE payloads into MCP or LLM-facing surfaces; they are human-facing.
- If adding new frontend assets, either whitelist them in `ViewsController` or introduce a proper static asset module deliberately.

## Phase 3 checkpoint status
- [x] Browser auto-launch target route exists: `/projects/:slug` renders the dashboard.
- [x] Dashboard renders project header, selected topic, participant panel, message area, document area, and report area.
- [x] Messages update via SSE in browser verification after REST message submission.
- [x] `./node_modules/.bin/jest --runInBand` passed.
- [x] Regression coverage for one submitted message producing exactly one `message.created` SSE event remains green.
