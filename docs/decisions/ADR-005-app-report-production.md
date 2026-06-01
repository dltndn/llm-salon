# ADR-005: App Report Production

Status: Accepted
Date: 2026-06-01
Related proposal:
- `docs/proposals/006-app-report-production.md`

Related specs:
- `docs/specs/02-domain-model.md`
- `docs/specs/05-api.md`
- `docs/specs/06-mcp.md`
- `docs/specs/07-llm-integration.md`
- `docs/specs/10-testing.md`

Related decisions:
- `docs/decisions/ADR-001-app-turn-waiting.md`
- `docs/decisions/ADR-002-consensus-early-stop.md`

## Context

Consensus topics can leave `debating` when every active participant's latest debating statement has `debateSignal = ready_to_finalize`. The existing report pipeline, however, requires an active provider participant to act as reporter. An app-only topic can therefore reach consensus but fail to enter `drafting`, because app participants are active debate participants but are not server-invoked providers.

This made the UI term `ACTIVE` ambiguous: it correctly described participation in turn-taking, but it did not mean the topic was report-capable under the provider-only pipeline.

## Options Considered

### Keep provider-only report production

- Pros:
- Preserves the existing server-driven report pipeline.
- Keeps report generation fully automatic when a provider participant exists.

- Cons:
- App-only topics can reach consensus but cannot complete the report lifecycle.
- Users see active app participants and a ready debate, but finalization fails with a phase transition conflict.
- The product requires a provider participant even when the debate itself was entirely conducted by app participants.

### Let the consensus-completing app participant act as reporter when no provider is available

- Pros:
- App-only topics can complete the same lifecycle as provider-backed topics.
- Reuses the existing app waiting contract instead of requiring app-specific automation.
- Keeps reporter ownership deterministic for app-only topics: the current turn holder that completes consensus becomes reporter.

- Cons:
- `wait_for_turn` must broaden from debate/review waiting to the next actionable app task.
- Report draft and final submission need explicit app-facing submission tools.
- App report tasks remain pending until the app reporter resumes and submits them.

### Let the user manually choose an app reporter

- Pros:
- Gives the user direct control over who writes the report.
- Could support correction when the current turn holder is not the desired reporter.

- Cons:
- Adds user scheduling to a flow that should remain participant-driven.
- Introduces extra UI/API state before the core app-only lifecycle is solved.

## Decision

App-only topics must be able to enter report production after their normal completion condition is met.

Provider-backed topics continue to prefer the server-driven provider report pipeline. When a topic has at least one active provider, the provider reporter is selected as before.

When a consensus topic reaches readiness and has no active provider, the current turn holder becomes the reporter. The topic enters `drafting`, and the reporter receives a report draft task through the same waiting flow used for app debate turns. The final debate message is not treated as the report draft; report drafting is a separate step.

Report draft and final report submission are separate API/MCP actions from `submit_message`. The app-facing tools are `submit_report_draft(projectId, topicId, participantId, content)` and `submit_report_final(projectId, topicId, participantId, content)`. `submit_report_draft` is valid in `drafting`, requires the caller to be the reporter, saves draft content, and advances the topic to `reviewing`. `submit_report_final` is valid in `finalizing`, requires the caller to be the reporter, saves final content and the report file, and advances the topic to `finalized`.

The same reporter owns both draft and final report production. If the app reporter does not respond, the report-production task remains open and is not automatically reassigned on timeout.

The existing reporter relationship stores the report lifecycle owner. It may reference a provider participant or an app participant; participant type determines whether production is server-driven or app-submitted.

`wait_for_action` responses include `isActionable`, `action`, `assignedMember`, and `mySelf` fields so app participants can determine whether they should act, which task to perform, which member currently owns the task, and their own anonymous identity. The action values are `submit_debate_message`, `submit_review_feedback`, `submit_report_draft`, `submit_report_final`, and `none`.

Action discovery is caller-centered. In phases where multiple participants may be actionable at the same time, such as `reviewing`, the response only needs to tell the caller whether they are actionable. `assignedMember` is the caller when the caller is actionable; otherwise it may be null unless there is a single current assignee such as a debate speaker or reporter.

The `action` value describes the next semantic task, not necessarily a one-to-one MCP tool name. `submit_review_feedback` continues to use the existing `submit_message` path during `reviewing`; report draft and final report use dedicated submission tools.

`wait_for_action` becomes the single app-facing task discovery tool. `get_turn`, `is_my_turn`, and `wait_for_turn` are removed from the app participant contract rather than being extended with report-task semantics. No deprecated aliases are kept.

`timeoutMs = 0` on `wait_for_action` means "evaluate current state and return immediately." When omitted, `wait_for_action` keeps bounded long-poll behavior. An immediately actionable response uses `wakeupReason = immediate`; a non-actionable zero-timeout response uses `wakeupReason = timeout`.

`get_context` is the context source for the current actionable task. It includes debate instructions during debate turns, review instructions during feedback collection, draft-report instructions during `drafting`, and final-report instructions during `finalizing`. A separate `get_report_context` tool is not introduced.

Report draft and final report content are stored only as report artifacts on the report record. The submission tools do not duplicate report body content as topic messages.

Reviewing keeps the existing completion rule: every active participant, including the reporter, must submit feedback once before the topic can enter `finalizing`.

## Consequences

- `wait_for_action` becomes a wait for the next actionable app task, not only for a debate turn.
- `get_turn`, `is_my_turn`, and `wait_for_turn` are removed from the app participant contract.
- No compatibility aliases are retained for the removed turn-discovery tools.
- `wait_for_action(timeoutMs = 0)` replaces immediate turn/status checks.
- `isActionable` replaces `isMyTurn` in the app action-discovery response.
- `assignedMember` replaces `currentMember` for app action discovery.
- Reviewing does not expose a full pending-member assignment list through `wait_for_action`.
- MCP responses distinguish task intent with `action` so app participants know whether to submit a debate statement, report draft, feedback, or final report.
- New report submission tools are required for app reporters.
- Existing context retrieval broadens from debate-only context to current-task context.
- Report content has a single source of truth in the report record.
- App-only report production preserves the existing all-active-participants review completion rule.
- Specs must define provider reporter and app reporter behavior under one report lifecycle.
- Mixed app/provider topics preserve provider-first report production.
- Existing reporter fields keep their schema shape but broaden from provider-only ownership to report lifecycle ownership.
- Tests must cover app-only consensus completion through `drafting`, `reviewing`, `finalizing`, and `finalized`.
