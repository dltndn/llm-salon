import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

import { McpHttpBridge, readPackageVersion } from './http-bridge';
import { McpToolError } from './errors';
import { isMcpToolName, MCP_TOOLS } from './tools';
import { assertAnonymousPayload } from '../common/interceptors/anonymous-guard.interceptor';

type RequestId = string | number;

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: RequestId;
  method: string;
  params?: Record<string, unknown>;
};

type ToolCallParams = { name?: unknown; arguments?: unknown };

export async function startMcpStdioServer(
  bridge = new McpHttpBridge(),
): Promise<void> {
  const transport = new StdioServerTransport();

  transport.onmessage = (message) => {
    void handleMessage(transport, bridge, message);
  };
  transport.onerror = (error) => {
    process.stderr.write(`MCP stdio transport error: ${error.message}\n`);
  };

  await transport.start();
}

async function handleMessage(
  transport: StdioServerTransport,
  bridge: McpHttpBridge,
  message: JSONRPCMessage,
): Promise<void> {
  if (!isJsonRpcRequest(message)) {
    return;
  }

  try {
    if (message.method === 'initialize') {
      await sendResult(transport, message.id, {
        protocolVersion: negotiateProtocolVersion(message.params),
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: 'llm-salon',
          version: await readPackageVersion(),
        },
      });
      return;
    }

    if (message.method === 'ping') {
      await sendResult(transport, message.id, {});
      return;
    }

    if (message.method === 'tools/list') {
      await sendResult(transport, message.id, {
        tools: MCP_TOOLS,
      });
      return;
    }

    if (message.method === 'tools/call') {
      await handleToolCall(transport, bridge, message);
      return;
    }

    await sendError(
      transport,
      message.id,
      -32601,
      `Unsupported MCP method: ${message.method}`,
    );
  } catch (error) {
    await sendError(
      transport,
      message.id,
      -32603,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function handleToolCall(
  transport: StdioServerTransport,
  bridge: McpHttpBridge,
  message: JsonRpcRequest,
): Promise<void> {
  const params = message.params as ToolCallParams | undefined;

  if (!isMcpToolName(params?.name)) {
    await sendError(
      transport,
      message.id,
      -32602,
      `Unknown MCP tool: ${String(params?.name)}`,
    );
    return;
  }

  try {
    const result = await bridge.callTool(
      params.name,
      isRecord(params.arguments) ? params.arguments : {},
    );
    assertAnonymousPayload(result);
    await sendResult(transport, message.id, {
      structuredContent: result,
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    });
  } catch (error) {
    const structuredContent =
      error instanceof McpToolError
        ? error.structuredContent
        : {
            error: 'TOOL_ERROR',
            message: error instanceof Error ? error.message : String(error),
          };

    assertAnonymousPayload(structuredContent);
    await sendResult(transport, message.id, {
      isError: true,
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent),
        },
      ],
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function negotiateProtocolVersion(params: Record<string, unknown> | undefined) {
  const requestedVersion = params?.protocolVersion;

  return typeof requestedVersion === 'string' &&
    SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
    ? requestedVersion
    : LATEST_PROTOCOL_VERSION;
}

function isJsonRpcRequest(message: JSONRPCMessage): message is JsonRpcRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    'id' in message &&
    'method' in message &&
    message.jsonrpc === '2.0' &&
    typeof message.method === 'string'
  );
}

async function sendResult(
  transport: StdioServerTransport,
  id: RequestId,
  result: Record<string, unknown>,
): Promise<void> {
  await transport.send({
    jsonrpc: '2.0',
    id,
    result,
  });
}

async function sendError(
  transport: StdioServerTransport,
  id: RequestId,
  code: number,
  message: string,
): Promise<void> {
  await transport.send({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  });
}
