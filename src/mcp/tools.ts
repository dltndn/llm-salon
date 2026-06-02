export type McpToolName =
  | 'create_project'
  | 'get_server_status'
  | 'get_project_status'
  | 'join_project'
  | 'create_topic'
  | 'add_document'
  | 'get_context'
  | 'wait_for_action'
  | 'submit_message'
  | 'submit_report_draft'
  | 'submit_report_final'
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
const debateSignalField = {
  type: 'string',
  enum: ['continue', 'ready_to_finalize'],
};

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
const topicParticipantInputSchema = objectSchema({
  projectId: stringField,
  topicId: stringField,
  participantId: stringField,
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
          projectId: stringField,
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
      phase: { type: ['string', 'null'] },
      mode: { type: ['string', 'null'] },
      currentRound: { type: ['number', 'null'] },
      maxRounds: { type: ['number', 'null'] },
      currentTurnIndex: { type: ['number', 'null'] },
      maxTurns: { type: ['number', 'null'] },
      currentMember: optionalStringField,
      reporterMember: optionalStringField,
      participants: { type: 'array' },
      topic: {
        type: ['object', 'null'],
        properties: {
          title: stringField,
          mode: stringField,
        },
        required: ['title', 'mode'],
        additionalProperties: false,
      },
      documents: { type: 'array' },
      ...volatileFields,
      topicVersion: { type: ['number', 'null'] },
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
    description:
      'Return anonymized context and task-appropriate instructions for the caller.',
    inputSchema: topicParticipantInputSchema,
    outputSchema: objectSchema({
      systemPrompt: stringField,
      contextMessages: { type: 'array' },
    }),
  },
  {
    name: 'wait_for_action',
    description:
      'Wait until the caller has an actionable task or the wait times out.',
    inputSchema: objectSchema(
      {
        projectId: stringField,
        topicId: stringField,
        participantId: stringField,
        afterTopicVersion: numberField,
        timeoutMs: numberField,
      },
      ['projectId', 'topicId', 'participantId'],
    ),
    outputSchema: objectSchema({
      isActionable: booleanField,
      action: stringField,
      assignedMember: optionalStringField,
      phase: stringField,
      currentRound: numberField,
      currentTurnIndex: numberField,
      wakeupReason: stringField,
      mySelf: optionalStringField,
      ...volatileFields,
    }),
  },
  {
    name: 'submit_message',
    description: 'Submit a debate or review feedback message.',
    inputSchema: objectSchema(
      {
        projectId: stringField,
        topicId: stringField,
        participantId: stringField,
        content: stringField,
        debateSignal: debateSignalField,
      },
      ['projectId', 'topicId', 'participantId', 'content'],
    ),
    outputSchema: objectSchema({
      messageId: stringField,
      nextMember: optionalStringField,
      phaseAfter: stringField,
    }),
  },
  {
    name: 'submit_report_draft',
    description: 'Submit an app reporter draft report artifact.',
    inputSchema: objectSchema(
      {
        projectId: stringField,
        topicId: stringField,
        participantId: stringField,
        content: stringField,
      },
      ['projectId', 'topicId', 'participantId', 'content'],
    ),
    outputSchema: objectSchema({
      reportId: stringField,
      phaseAfter: stringField,
    }),
  },
  {
    name: 'submit_report_final',
    description: 'Submit an app reporter final report artifact.',
    inputSchema: objectSchema(
      {
        projectId: stringField,
        topicId: stringField,
        participantId: stringField,
        content: stringField,
      },
      ['projectId', 'topicId', 'participantId', 'content'],
    ),
    outputSchema: objectSchema({
      reportId: stringField,
      phaseAfter: stringField,
      filePath: stringField,
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
        finalContent: optionalStringField,
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
