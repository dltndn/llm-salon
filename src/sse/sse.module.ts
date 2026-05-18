import { Module } from '@nestjs/common';

import { EventsModule } from '../events/events.module';
import { SseBroadcasterService } from './sse-broadcaster.service';
import { SseController } from './sse.controller';

@Module({
  imports: [EventsModule],
  controllers: [SseController],
  providers: [SseBroadcasterService],
  exports: [SseBroadcasterService],
})
export class SseModule {}
