import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { applyHttpGlobals } from '../src/http/apply-http-globals';
import { PrismaService } from '../src/prisma/prisma.service';

export async function createTestApp(
  prismaOverride?: unknown,
): Promise<INestApplication> {
  const testingModuleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (prismaOverride !== undefined) {
    testingModuleBuilder.overrideProvider(PrismaService).useValue(prismaOverride);
  }

  const moduleRef = await testingModuleBuilder.compile();
  const app = moduleRef.createNestApplication();
  applyHttpGlobals(app);
  await app.init();

  return app;
}
