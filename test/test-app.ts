import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { applyHttpGlobals } from '../src/http/apply-http-globals';
import { PrismaService } from '../src/prisma/prisma.service';

export async function createTestApp(
  prismaOverride?: unknown,
  overrides: Array<(builder: TestingModuleBuilder) => void> = [],
): Promise<INestApplication> {
  const testingModuleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (prismaOverride !== undefined) {
    testingModuleBuilder.overrideProvider(PrismaService).useValue(prismaOverride);
  }

  for (const applyOverride of overrides) {
    applyOverride(testingModuleBuilder);
  }

  const moduleRef = await testingModuleBuilder.compile();
  const app = moduleRef.createNestApplication();
  applyHttpGlobals(app);
  await app.init();

  return app;
}
