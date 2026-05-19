export type McpToolName =
  | 'create_project'
  | 'get_server_status'
  | 'get_project_status'
  | 'join_project'
  | 'create_topic'
  | 'add_document'
  | 'get_context'
  | 'get_turn'
  | 'is_my_turn'
  | 'submit_message'
  | 'get_report_status';

type JsonSchema = Record<string, unknown>;

export type McpToolDefinition = {
  name: McpToolName;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
};

const stringField = { type: 'string' };
const optionalStringField = { type: ['string', 'null'] };
const numberField = { type: 'number' };
const booleanField = { type: 'boolean' };

function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = Object.keys(properties),
): JsonSchema {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

const emptyInputSchema = objectSchema({}, []);
const topicInputSchema = objectSchema({
  projectId: stringField,
  topicId: stringField,
});
const volatileFields = {
  serverTime: stringField,
  topicVersion: numberField,
};

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'create_project',
    description: 'Create a new LLM-Salon project.',
    inputSchema: objectSchema({ name: stringField }),
    outputSchema: objectSchema({
      projectId: stringField,
      slug: stringField,
      url: stringField,
    }),
  },
  {
    name: 'get_server_status',
    description: 'Return the running LLM-Salon server status.',
    inputSchema: emptyInputSchema,
    outputSchema: objectSchema({
      version: stringField,
      projects: {
        type: 'array',
        items: objectSchema({
          slug: stringField,
          name: stringField,
          phase: optionalStringField,
          status: stringField,
        }),
      },
      host: { const: '127.0.0.1' },
      port: numberField,
    }),
  },
  {
    name: 'get_project_status',
    description: 'Return anonymous project, topic, turn, participant, and document status.',
    inputSchema: objectSchema({ projectIdOrSlug: stringField }),
    outputSchema: objectSchema({
      phase: stringField,
      mode: stringField,
      currentRound: numberField,
      maxRounds: { type: ['number', 'null'] },
      currentTurnIndex: numberField,
      maxTurns: { type: ['number', 'null'] },
      currentMember: optionalStringField,
      reporterMember: optionalStringField,
      participants: { type: 'array' },
      topic: objectSchema({ title: stringField, mode: stringField }),
      documents: { type: 'array' },
      ...volatileFields,
    }),
  },
  {
    name: 'join_project',
    description: 'Register an LLM app participant in a project.',
    inputSchema: objectSchema({
      projectId: stringField,
      clientName: stringField,
      modelName: stringField,
    }),
    outputSchema: objectSchema({
      participantId: stringField,
      anonymousName: stringField,
      joinOrder: numberField,
    }),
  },
  {
    name: 'create_topic',
    description: 'Create a topic in a project.',
    inputSchema: objectSchema(
      {
        projectId: stringField,
        title: stringField,
        description: stringField,
        mode: stringField,
        maxRounds: numberField,
        maxTurns: numberField,
      },
      ['projectId', 'title'],
    ),
    outputSchema: objectSchema({ topicId: stringField }),
  },
  {
    name: 'add_document',
    description: 'Attach inline text content to a project or topic.',
    inputSchema: objectSchema(
      {
        projectId: stringField,
        topicId: stringField,
        fileName: stringField,
        content: stringField,
      },
      ['projectId', 'fileName', 'content'],
    ),
    outputSchema: objectSchema({ documentId: stringField }),
  },
  {
    name: 'get_context',
    description: 'Return the anonymized LLM context payload for a topic.',
    inputSchema: topicInputSchema,
    outputSchema: objectSchema({
      systemPrompt: stringField,
      contextMessages: { type: 'array' },
    }),
  },
  {
    name: 'get_turn',
    description: 'Return the current anonymous turn status.',
    inputSchema: objectSchema(
      {
        projectId: stringField,
        topicId: stringField,
        participantId: stringField,
      },
      ['projectId', 'topicId'],
    ),
    outputSchema: objectSchema(
      {
        currentMember: optionalStringField,
        phase: stringField,
        currentRound: numberField,
        currentTurnIndex: numberField,
        isMyTurn: booleanField,
        mySelf: optionalStringField,
        ...volatileFields,
      },
      ['currentMember', 'phase', 'currentRound', 'currentTurnIndex', 'serverTime', 'topicVersion'],
    ),
  },
  {
    name: 'is_my_turn',
    description: 'Return whether a participant currently holds the turn.',
    inputSchema: objectSchema({
      projectId: stringField,
      topicId: stringField,
      participantId: stringField,
    }),
    outputSchema: objectSchema({
      isMyTurn: booleanField,
      currentMember: optionalStringField,
      phase: stringField,
      ...volatileFields,
    }),
  },
  {
    name: 'submit_message',
    description: 'Submit a debate message for the current turn holder.',
    inputSchema: objectSchema({
      projectId: stringField,
      topicId: stringField,
      participantId: stringField,
      content: stringField,
    }),
    outputSchema: objectSchema({
      messageId: stringField,
      nextMember: optionalStringField,
      phaseAfter: stringField,
    }),
  },
  {
    name: 'get_report_status',
    description: 'Return report availability and status for a topic.',
    inputSchema: topicInputSchema,
    outputSchema: objectSchema(
      {
        status: stringField,
        draftAvailable: booleanField,
        finalAvailable: booleanField,
        filePath: stringField,
        draftPreview: stringField,
      },
      ['status', 'draftAvailable', 'finalAvailable'],
    ),
  },
];

export function isMcpToolName(value: unknown): value is McpToolName {
  return (
    typeof value === 'string' &&
    MCP_TOOLS.some((tool) => tool.name === value)
  );
}
