# LLM-Salon

## Language

**Active participant**: A participant currently included in the topic's turn-taking and consensus rules.
Avoid: using "active" to imply that the participant can perform every system role.

**Report-capable topic**: A topic that can move from debate into report production after its completion condition is met, even when every active participant joined through an LLM app.
Avoid: provider-only finalization.

**App reporter**: An app participant responsible for producing the report draft and final report when a topic with no active provider leaves debate.
Avoid: treating app reporters as server-invoked providers.

**Reporter**: The participant that owns report production for a topic, whether provider-backed or app-backed.
Avoid: using reporter to mean provider only.

**Report draft turn**: A report-production task opened after debate completion, separate from the final debate message that triggered it.
Avoid: treating the final debate message as the report draft.

**Report artifact submission**: A reporter's explicit submission of report draft or final report content.
Avoid: overloading debate message submission for report artifacts.

**Report artifact**: Draft or final report content whose source of truth is the topic's report record.
Avoid: duplicating report body content as debate timeline messages.

**Actionable task**: Work currently assigned to an app participant, including debate turns and report-production tasks.
Avoid: using "turn" when the assignment may not be a debate statement.

## Relationships

- An active participant may be an app participant or a provider participant.
- Report production must not require a provider participant when the topic is otherwise ready to leave debate.
- When a topic reaches consensus and has an active provider, provider report production takes priority.
- When a topic reaches consensus and has no active provider, the current turn holder becomes the app reporter.
- The same reporter owns both draft and final report production for a topic.
- The report draft turn follows the final debate message instead of being embedded in it.
- App participants use the action wait flow as the single way to discover their next actionable task.
- An app reporter's report-production task remains open until that reporter submits it; it is not automatically reassigned on timeout.
- Report draft and final report content are submitted as report artifacts, not debate messages.
- Report artifacts live in the report record and are not duplicated as topic messages.
- The topic context returned to an app participant describes the participant's current actionable task, not only debate turns.

## Flagged ambiguities

- "Active" previously appeared in the UI as a participant status while the report pipeline required an active provider. Resolve "active" as participation status only, not report capability.
