import {
  MCP_DOMAIN_ERROR_CODES,
  mcpToolErrorFromHttpError,
} from './errors';

describe('MCP error mapping', () => {
  it.each([
    ['DocumentTooLargeError', 'DOCUMENT_TOO_LARGE'],
    ['DuplicateAppRegistrationError', 'DUPLICATE_APP_REGISTRATION'],
    ['MissingApiKeyError', 'MISSING_API_KEY'],
    ['ParticipantConflictError', 'PARTICIPANT_CONFLICT'],
    ['PhaseTransitionError', 'PHASE_TRANSITION_CONFLICT'],
    ['ProviderCallFailedError', 'PROVIDER_CALL_FAILED'],
    ['RegistrationClosedError', 'REGISTRATION_CLOSED'],
    ['ReportAlreadyExistsError', 'REPORT_ALREADY_EXISTS'],
    ['WrongTurnError', 'WRONG_TURN'],
  ])('maps %s to %s', (httpErrorName, mcpCode) => {
    expect(MCP_DOMAIN_ERROR_CODES[httpErrorName]).toBe(mcpCode);
  });

  it('preserves the current anonymous member for wrong-turn errors', () => {
    const error = mcpToolErrorFromHttpError({
      status: 409,
      body: {
        error: 'WrongTurnError',
        message: 'Wrong turn. Current participant: Member A',
      },
    });

    expect(error.structuredContent).toEqual({
      error: 'WRONG_TURN',
      currentMember: 'Member A',
      message: 'Wrong turn. Current participant: Member A',
      statusCode: 409,
    });
  });

  it('masks secrets in mapped HTTP error messages', () => {
    const error = mcpToolErrorFromHttpError({
      status: 502,
      body: {
        error: 'ProviderCallFailedError',
        message: 'openai provider call failed: apiKey=secret-value',
      },
    });

    expect(error.structuredContent).toEqual({
      error: 'PROVIDER_CALL_FAILED',
      message: 'openai provider call failed: apiKey=[redacted]',
      statusCode: 502,
    });
  });
});
