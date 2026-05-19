import { Module } from '@nestjs/common';

import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import { MessagesModule } from '../messages/messages.module';
import { PromptModule } from '../prompt/prompt.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';
import { TurnsModule } from '../turns/turns.module';
import { ParticipantsController } from './participants.controller';
import { ParticipantsService } from './participants.service';
import { ProviderParticipantService } from './provider-participant.service';

@Module({
  imports: [
    PrismaModule,
    EventsModule,
    LlmModule,
    MessagesModule,
    PromptModule,
    SecurityModule,
    TurnsModule,
  ],
  controllers: [ParticipantsController],
  providers: [ParticipantsService, ProviderParticipantService],
  exports: [ParticipantsService],
})
export class ParticipantsModule {}
