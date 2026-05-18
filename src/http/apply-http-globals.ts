import { INestApplication, ValidationPipe } from '@nestjs/common';

import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';

export function applyHttpGlobals(app: INestApplication): void {
  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
