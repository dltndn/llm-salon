import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { EventsModule } from './events/events.module';
import { EjsRendererService } from './http/ejs-renderer.service';
import { HealthController } from './http/health.controller';
import { ViewsController } from './http/views.controller';
import { ViewsService } from './http/views.service';
import { MessagesModule } from './messages/messages.module';
import { ParticipantsModule } from './participants/participants.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { SseModule } from './sse/sse.module';
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
    SseModule,
  ],
  controllers: [HealthController, ViewsController],
  providers: [EjsRendererService, ViewsService],
})
export class AppModule {}
