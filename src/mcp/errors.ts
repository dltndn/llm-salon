import { maskLogMessage } from '../security/masking.interceptor';

export const MCP_DOMAIN_ERROR_CODES: Record<string, string> = {
  DocumentTooLargeError: 'DOCUMENT_TOO_LARGE',
  DuplicateAppRegistrationError: 'DUPLICATE_APP_REGISTRATION',
  MissingApiKeyError: 'MISSING_API_KEY',
  ParticipantConflictError: 'PARTICIPANT_CONFLICT',
  PhaseTransitionError: 'PHASE_TRANSITION_CONFLICT',
  ProviderCallFailedError: 'PROVIDER_CALL_FAILED',
  RegistrationClosedError: 'REGISTRATION_CLOSED',
  ReportAlreadyExistsError: 'REPORT_ALREADY_EXISTS',
  WrongTurnError: 'WRONG_TURN',
};

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

export function mcpToolErrorFromHttpError(input: {
  status: number;
  body: { error?: unknown; message?: unknown };
}): McpToolError {
  const errorName = typeof input.body.error === 'string'
    ? input.body.error
    : 'HTTP_ERROR';
  const message = typeof input.body.message === 'string'
    ? maskLogMessage(input.body.message)
    : `HTTP ${input.status}`;
  const structuredContent: Record<string, unknown> = {
    error: MCP_DOMAIN_ERROR_CODES[errorName] ?? 'HTTP_ERROR',
    message,
    statusCode: input.status,
  };

  if (errorName === 'WrongTurnError') {
    structuredContent.currentMember = parseCurrentMember(message);
  }

  return new McpToolError(structuredContent);
}

function parseCurrentMember(message: string): string | null {
  return message.match(/Current participant: (.+)$/u)?.[1] ?? null;
}
