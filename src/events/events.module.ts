import { Module } from '@nestjs/common';

import { DomainEventBus } from './event-bus';

@Module({
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class EventsModule {}
