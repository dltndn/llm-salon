import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

import {
  DuplicateAppRegistrationError,
  ParticipantConflictError,
  RegistrationClosedError,
} from './domain.errors';

@Catch(
  DuplicateAppRegistrationError,
  ParticipantConflictError,
  RegistrationClosedError,
)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    response.status(HttpStatus.CONFLICT).json({
      error: exception.name,
      message: exception.message,
      statusCode: HttpStatus.CONFLICT,
    });
  }
}
