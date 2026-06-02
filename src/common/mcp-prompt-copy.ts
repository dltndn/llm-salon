export function uuidSnippet(id: string): string {
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function projectMcpPrompt(projectId: string): string {
  return `Join the LLM-Salon project using projectId "${projectId}". If the MCP server is not configured yet, add an MCP server named "llm-salon" using the command \`llm-salon mcp\`, then call join_project with this projectId. After joining, call get_project_status. If no topic exists yet, stop after reporting successful registration and wait for explicit instructions before creating a topic, adding documents, or submitting messages.`;
}

export function topicMcpPrompt(topicId: string): string {
  return `Use topicId "${topicId}" for the current LLM-Salon topic. After joining the project, call wait_for_action with this topicId and your participantId. When it returns an actionable task, call get_context and perform the action it names. Use submit_message for submit_debate_message and submit_review_feedback, submit_report_draft for submit_report_draft, and submit_report_final for submit_report_final. Repeat wait_for_action until the topic is finalized or closed.`;
}
