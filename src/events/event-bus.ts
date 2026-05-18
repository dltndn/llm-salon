import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

import { DomainEvent } from './domain-events';

@Injectable()
export class DomainEventBus {
  private readonly emitter = new EventEmitter();

  emit(event: DomainEvent): void {
    this.emitter.emit(event.type, event.payload);
  }

  on<T extends DomainEvent['type']>(
    type: T,
    listener: (payload: Extract<DomainEvent, { type: T }>['payload']) => void,
  ): void {
    this.emitter.on(type, listener);
  }
}
