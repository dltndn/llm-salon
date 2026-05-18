import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { AnonymousGuardInterceptor } from '../common/interceptors/anonymous-guard.interceptor';

export function applyHttpGlobals(app: INestApplication): void {
  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalInterceptors(
    new AnonymousGuardInterceptor(app.get(Reflector)),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
