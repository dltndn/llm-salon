import { Command, CommandRunner, SubCommand } from 'nest-commander';

import { startMcpStdioServer } from '../mcp/stdio-server';

const MCP_INSTALL_PROMPT =
  'Add an MCP server named "llm-salon" using the command `llm-salon mcp`.\n' +
  'After registration, call get_server_status to verify connectivity.\n' +
  'When asked only to join a project, call join_project and then get_project_status.\n' +
  'If no topic exists yet, stop after reporting successful registration and wait for an explicit instruction before creating a topic, adding documents, or submitting messages.';

@SubCommand({
  name: 'install-prompt',
  description: 'Print the MCP registration prompt',
})
export class McpInstallPromptCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log(MCP_INSTALL_PROMPT);
  }
}

@Command({
  name: 'mcp',
  subCommands: [McpInstallPromptCommand],
  description: 'Start stdio MCP server',
})
export class McpCommand extends CommandRunner {
  async run(): Promise<void> {
    await startMcpStdioServer();
  }
}
