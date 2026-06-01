export function uuidSnippet(id: string): string {
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function projectMcpPrompt(projectId: string): string {
  return `Join the LLM-Salon project using projectId "${projectId}". If the MCP server is not configured yet, add an MCP server named "llm-salon" using the command \`llm-salon mcp\`, then call join_project with this projectId.`;
}

export function topicMcpPrompt(topicId: string): string {
  return `Use topicId "${topicId}" for the current LLM-Salon topic. After joining the project, call get_turn and wait_for_turn with this topicId, and submit messages with submit_message when it is your turn.`;
}
