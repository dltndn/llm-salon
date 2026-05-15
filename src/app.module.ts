import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { HealthController } from './http/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { TopicsModule } from './topics/topics.module';

@Module({
  imports: [AppConfigModule, PrismaModule, ProjectsModule, TopicsModule],
  controllers: [HealthController],
})
export class AppModule {}
