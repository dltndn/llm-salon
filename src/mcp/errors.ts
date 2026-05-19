export class McpToolError extends Error {
  constructor(readonly structuredContent: Record<string, unknown>) {
    super(
      typeof structuredContent.message === 'string'
        ? structuredContent.message
        : 'MCP tool call failed.',
    );
    this.name = 'McpToolError';
  }
}
