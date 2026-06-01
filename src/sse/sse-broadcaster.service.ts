import {
  Injectable,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { DOMAIN_EVENT, DomainEvent } from '../events/domain-events';
import { DomainEventBus } from '../events/event-bus';
import { maskLogValue } from '../security/masking.interceptor';

const MAX_REPLAY_EVENTS = 100;

type SseEventType = DomainEvent['type'];

type QueuedSseEvent = MessageEvent & {
  id: string;
  type: SseEventType;
};

@Injectable()
export class SseBroadcasterService implements OnModuleInit, OnModuleDestroy {
  private readonly streams = new Map<string, Subject<QueuedSseEvent>>();
  private readonly queues = new Map<string, QueuedSseEvent[]>();
  private readonly nextEventIds = new Map<string, number>();
  private unsubscribeFromDomainEvents: Array<() => void> = [];

  constructor(private readonly events: DomainEventBus) {}

  onModuleInit(): void {
    this.unsubscribeFromDomainEvents = [
      this.events.on(DOMAIN_EVENT.messageCreated, (payload) =>
        this.publish(payload.projectSlug, DOMAIN_EVENT.messageCreated, {
          projectId: payload.projectId,
          topicId: payload.topicId,
          message: {
            id: payload.message.id,
            displayName: payload.message.participant.displayName,
            anonymousName: payload.message.participant.anonymousName,
            content: payload.message.content,
            phase: payload.message.phase,
            turnIndex: payload.message.turnIndex,
            createdAt: payload.message.createdAt,
          },
        }),
      ),
      this.events.on(DOMAIN_EVENT.turnChanged, (payload) =>
        this.publish(payload.projectSlug, DOMAIN_EVENT.turnChanged, {
          projectId: payload.projectId,
          topicId: payload.topicId,
          currentParticipant: {
            id: payload.turn.currentParticipantId,
            displayName: payload.turn.currentParticipant.displayName,
          },
          turnIndex: payload.turn.turnIndex,
          roundIndex: payload.turn.roundIndex,
        }),
      ),
      this.events.on(DOMAIN_EVENT.participantJoined, (payload) =>
        this.publish(payload.projectSlug, DOMAIN_EVENT.participantJoined, {
          projectId: payload.projectId,
          participant: payload.participant,
        }),
      ),
      this.events.on(DOMAIN_EVENT.topicPhaseChanged, (payload) =>
        this.publish(payload.projectSlug, DOMAIN_EVENT.topicPhaseChanged, {
          projectId: payload.projectId,
          topicId: payload.topicId,
          phase: payload.phase,
        }),
      ),
      this.events.on(DOMAIN_EVENT.reportDraftCreated, (payload) =>
        this.publish(payload.projectSlug, DOMAIN_EVENT.reportDraftCreated, {
          projectId: payload.projectId,
          topicId: payload.topicId,
          reportId: payload.reportId,
        }),
      ),
      this.events.on(DOMAIN_EVENT.reportCreated, (payload) =>
        this.publish(payload.projectSlug, DOMAIN_EVENT.reportCreated, {
          projectId: payload.projectId,
          topicId: payload.topicId,
          report: payload.report,
        }),
      ),
      this.events.on(DOMAIN_EVENT.projectClosed, (payload) =>
        this.publish(payload.projectSlug, DOMAIN_EVENT.projectClosed, {
          projectId: payload.projectId,
        }),
      ),
    ];
  }

  onModuleDestroy(): void {
    for (const unsubscribe of this.unsubscribeFromDomainEvents) {
      unsubscribe();
    }
  }

  streamProject(slug: string, lastEventId?: string): Observable<MessageEvent> {
    const stream = this.getStream(slug);

    return new Observable<MessageEvent>((subscriber) => {
      const buffered: QueuedSseEvent[] = [];
      let replaying = true;
      const subscription = stream.subscribe((event) => {
        if (replaying) {
          buffered.push(event);
          return;
        }

        subscriber.next(event);
      });
      const replay = this.getReplayEvents(slug, lastEventId);
      const replayedIds = new Set(replay.map((event) => event.id));

      for (const event of replay) {
        subscriber.next(event);
      }

      replaying = false;
      for (const event of buffered) {
        if (!replayedIds.has(event.id) && this.isAfterLastEventId(event, lastEventId)) {
          subscriber.next(event);
        }
      }

      return () => subscription.unsubscribe();
    });
  }

  private publish(
    projectSlug: string,
    type: SseEventType,
    data: QueuedSseEvent['data'],
  ): void {
    const event: QueuedSseEvent = {
      id: this.nextId(projectSlug),
      type,
      data: maskLogValue(data) as QueuedSseEvent['data'],
    };
    const queue = this.getQueue(projectSlug);

    queue.push(event);
    if (queue.length > MAX_REPLAY_EVENTS) {
      queue.shift();
    }

    this.getStream(projectSlug).next(event);
  }

  private getReplayEvents(slug: string, lastEventId?: string): QueuedSseEvent[] {
    if (lastEventId === undefined) {
      return [];
    }

    const lastSeen = this.parseLastEventId(lastEventId);
    if (lastSeen === null) {
      return [];
    }

    return this.getQueue(slug).filter((event) => Number(event.id) > lastSeen);
  }

  private isAfterLastEventId(
    event: QueuedSseEvent,
    lastEventId?: string,
  ): boolean {
    const lastSeen = this.parseLastEventId(lastEventId);
    return lastSeen === null || Number(event.id) > lastSeen;
  }

  private parseLastEventId(lastEventId?: string): number | null {
    if (lastEventId === undefined) {
      return null;
    }

    const parsed = Number.parseInt(lastEventId, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private getStream(slug: string): Subject<QueuedSseEvent> {
    const existing = this.streams.get(slug);
    if (existing) {
      return existing;
    }

    const stream = new Subject<QueuedSseEvent>();
    this.streams.set(slug, stream);
    return stream;
  }

  private getQueue(slug: string): QueuedSseEvent[] {
    const existing = this.queues.get(slug);
    if (existing) {
      return existing;
    }

    const queue: QueuedSseEvent[] = [];
    this.queues.set(slug, queue);
    return queue;
  }

  private nextId(slug: string): string {
    const next = (this.nextEventIds.get(slug) ?? 0) + 1;
    this.nextEventIds.set(slug, next);
    return String(next);
  }
}
