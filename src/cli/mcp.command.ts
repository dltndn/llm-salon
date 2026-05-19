import { Command, CommandRunner, SubCommand } from 'nest-commander';

import { startMcpStdioServer } from '../mcp/stdio-server';

const MCP_INSTALL_PROMPT =
  'Add an MCP server named "llm-salon" using the command `llm-salon mcp`.\n' +
  'After registration, call get_server_status to verify connectivity.';

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
