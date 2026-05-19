import { HttpStatus } from '@nestjs/common';

import { DomainExceptionFilter } from './domain-exception.filter';
import {
  DocumentTooLargeError,
  ParticipantConflictError,
} from './domain.errors';

describe('DomainExceptionFilter', () => {
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
