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
import { maskLogMessage } from '../../security/masking.interceptor';
import {
  DocumentTooLargeError,
  DuplicateAppRegistrationError,
  PhaseTransitionError,
  ParticipantConflictError,
  RegistrationClosedError,
  ReportAlreadyExistsError,
  WrongTurnError,
} from './domain.errors';
import { Audience } from '../audience';

@Catch(
  DuplicateAppRegistrationError,
  PhaseTransitionError,
  ParticipantConflictError,
  RegistrationClosedError,
  ReportAlreadyExistsError,
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

    const statusCode = resolveDomainHttpStatus(exception);

    response.status(statusCode).json({
      error: exception.name,
      message:
        request.audience === 'anonymous' &&
        !(exception instanceof WrongTurnError) &&
        !(exception instanceof DocumentTooLargeError) &&
        !(exception instanceof MissingApiKeyError)
          ? 'Request conflicts with the current project state.'
          : maskLogMessage(exception.message),
      statusCode,
    });
  }
}

export function resolveDomainHttpStatus(exception: Error): HttpStatus {
  if (exception instanceof DocumentTooLargeError) {
    return HttpStatus.PAYLOAD_TOO_LARGE;
  }

  if (exception instanceof MissingApiKeyError) {
    return HttpStatus.BAD_REQUEST;
  }

  if (exception instanceof ProviderCallFailedError) {
    return exception.failureKind === 'timeout'
      ? HttpStatus.GATEWAY_TIMEOUT
      : HttpStatus.BAD_GATEWAY;
  }

  return HttpStatus.CONFLICT;
}
