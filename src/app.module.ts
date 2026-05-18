import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { HealthController } from './http/health.controller';
import { ParticipantsModule } from './participants/participants.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { TopicsModule } from './topics/topics.module';
import { TurnsModule } from './turns/turns.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ProjectsModule,
    TopicsModule,
    ParticipantsModule,
    TurnsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
