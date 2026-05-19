import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

import {
  MissingApiKeyError,
  ProviderCallFailedError,
} from '../../llm/llm.errors';
import {
  DocumentTooLargeError,
  DuplicateAppRegistrationError,
  PhaseTransitionError,
  ParticipantConflictError,
  RegistrationClosedError,
  WrongTurnError,
} from './domain.errors';
import { Audience } from '../audience';

@Catch(
  DuplicateAppRegistrationError,
  PhaseTransitionError,
  ParticipantConflictError,
  RegistrationClosedError,
  WrongTurnError,
  DocumentTooLargeError,
  MissingApiKeyError,
  ProviderCallFailedError,
)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ audience?: Audience }>();
    const response = http.getResponse<Response>();

    const statusCode =
      exception instanceof DocumentTooLargeError
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : exception instanceof MissingApiKeyError
          ? HttpStatus.BAD_REQUEST
          : exception instanceof ProviderCallFailedError
            ? exception.failureKind === 'timeout'
              ? HttpStatus.GATEWAY_TIMEOUT
              : HttpStatus.BAD_GATEWAY
            : HttpStatus.CONFLICT;

    response.status(statusCode).json({
      error: exception.name,
      message:
        request.audience === 'anonymous' &&
        !(exception instanceof WrongTurnError) &&
        !(exception instanceof DocumentTooLargeError) &&
        !(exception instanceof MissingApiKeyError)
          ? 'Request conflicts with the current project state.'
          : exception.message,
      statusCode,
    });
  }
}
