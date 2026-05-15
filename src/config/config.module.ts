import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { resolveConfiguredEnvFilePath } from './config.paths';
import { validateEnv } from './env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveConfiguredEnvFilePath(),
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
