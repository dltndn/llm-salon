import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

import { McpHttpBridge, readPackageVersion } from './http-bridge';

type RequestId = string | number;

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: RequestId;
  method: string;
  params?: Record<string, unknown>;
};

type ToolCallParams = {
  name?: unknown;
  arguments?: unknown;
};

const SERVER_STATUS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    projects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
          phase: { type: ['string', 'null'] },
          status: { type: 'string' },
        },
        required: ['slug', 'name', 'phase', 'status'],
        additionalProperties: false,
      },
    },
    host: { const: '127.0.0.1' },
    port: { type: 'number' },
  },
  required: ['version', 'projects', 'host', 'port'],
  additionalProperties: false,
};

const GET_SERVER_STATUS_TOOL = {
  name: 'get_server_status',
  description: 'Return the running LLM-Salon server status.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  outputSchema: SERVER_STATUS_OUTPUT_SCHEMA,
};

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
        tools: [GET_SERVER_STATUS_TOOL],
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

  if (params?.name !== 'get_server_status') {
    await sendError(
      transport,
      message.id,
      -32602,
      `Unknown MCP tool: ${String(params?.name)}`,
    );
    return;
  }

  try {
    const status = await bridge.getServerStatus();
    await sendResult(transport, message.id, {
      structuredContent: status,
      content: [
        {
          type: 'text',
          text: JSON.stringify(status),
        },
      ],
    });
  } catch (error) {
    await sendResult(transport, message.id, {
      isError: true,
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error),
        },
      ],
    });
  }
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
