import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { HealthController } from './http/health.controller';

@Module({
  imports: [AppConfigModule],
  controllers: [HealthController],
})
export class AppModule {}
