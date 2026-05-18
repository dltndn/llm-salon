import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './http/health.controller';
import { MessagesModule } from './messages/messages.module';
import { ParticipantsModule } from './participants/participants.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { TopicsModule } from './topics/topics.module';
import { TurnsModule } from './turns/turns.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    EventsModule,
    ProjectsModule,
    TopicsModule,
    ParticipantsModule,
    TurnsModule,
    MessagesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
