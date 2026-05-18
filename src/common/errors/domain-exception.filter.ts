import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

import {
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
)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ audience?: Audience }>();
    const response = http.getResponse<Response>();

    response.status(HttpStatus.CONFLICT).json({
      error: exception.name,
      message:
        request.audience === 'anonymous'
          ? 'Request conflicts with the current project state.'
          : exception.message,
      statusCode: HttpStatus.CONFLICT,
    });
  }
}
