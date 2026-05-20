import { HttpStatus } from '@nestjs/common';

import { DomainExceptionFilter } from './domain-exception.filter';
import {
  DocumentTooLargeError,
  DuplicateAppRegistrationError,
  PhaseTransitionError,
  ParticipantConflictError,
  RegistrationClosedError,
  ReportAlreadyExistsError,
  WrongTurnError,
} from './domain.errors';
import { MissingApiKeyError, ProviderCallFailedError } from '../../llm/llm.errors';

describe('DomainExceptionFilter', () => {
  it.each([
    [new DuplicateAppRegistrationError('Codex', 'GPT'), HttpStatus.CONFLICT],
    [new ParticipantConflictError('conflict'), HttpStatus.CONFLICT],
    [new RegistrationClosedError('project'), HttpStatus.CONFLICT],
    [new WrongTurnError('Member A'), HttpStatus.CONFLICT],
    [new PhaseTransitionError('preparing', 'finalized'), HttpStatus.CONFLICT],
    [new ReportAlreadyExistsError('topic-1'), HttpStatus.CONFLICT],
    [new DocumentTooLargeError('low', '64 KB'), HttpStatus.PAYLOAD_TOO_LARGE],
    [new MissingApiKeyError('OPENAI_API_KEY'), HttpStatus.BAD_REQUEST],
    [
      new ProviderCallFailedError('openai', 'server unavailable'),
      HttpStatus.BAD_GATEWAY,
    ],
    [
      new ProviderCallFailedError('openai', 'timeout', 'timeout'),
      HttpStatus.GATEWAY_TIMEOUT,
    ],
  ])('maps %s to HTTP %i', (error, expectedStatus) => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = createHost({ audience: 'human' }, { status });

    new DomainExceptionFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith({
      error: error.name,
      message: error.message,
      statusCode: expectedStatus,
    });
  });

  it('preserves DocumentTooLargeError guidance for anonymous callers', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = createHost({ audience: 'anonymous' }, { status });
    const error = new DocumentTooLargeError('low', '64 KB');

    new DomainExceptionFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(json).toHaveBeenCalledWith({
      error: 'DocumentTooLargeError',
      message: error.message,
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
    });
  });

  it('keeps generic anonymous messages for state conflicts', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = createHost({ audience: 'anonymous' }, { status });

    new DomainExceptionFilter().catch(
      new ParticipantConflictError('internal detail'),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      error: 'ParticipantConflictError',
      message: 'Request conflicts with the current project state.',
      statusCode: HttpStatus.CONFLICT,
    });
  });

  it('maps provider timeout failures to 504', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = createHost({ audience: 'human' }, { status });

    new DomainExceptionFilter().catch(
      new ProviderCallFailedError('openai', 'timeout', 'timeout'),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.GATEWAY_TIMEOUT);
    expect(json).toHaveBeenCalledWith({
      error: 'ProviderCallFailedError',
      message: 'openai provider call failed: timeout',
      statusCode: HttpStatus.GATEWAY_TIMEOUT,
    });
  });

  it('masks API key patterns in HTTP error messages', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = createHost({ audience: 'human' }, { status });

    new DomainExceptionFilter().catch(
      new ProviderCallFailedError('openai', 'Authorization: Bearer raw-secret'),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      error: 'ProviderCallFailedError',
      message: 'openai provider call failed: Authorization: Bearer [redacted]',
      statusCode: HttpStatus.BAD_GATEWAY,
    });
  });
});

function createHost(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as never;
}
