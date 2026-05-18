import { Message, Topic, Turn } from '@prisma/client';

export const DOMAIN_EVENT = {
  messageCreated: 'message.created',
  turnChanged: 'turn.changed',
  topicPhaseChanged: 'topic.phase_changed',
} as const;

export type MessageCreatedEvent = {
  projectId: string;
  topicId: string;
  message: Message;
};

export type TurnChangedEvent = {
  projectId: string;
  topicId: string;
  turn: Turn;
};

export type TopicPhaseChangedEvent = {
  projectId: string;
  topicId: string;
  phase: Topic['phase'];
};

export type DomainEvent =
  | {
      type: typeof DOMAIN_EVENT.messageCreated;
      payload: MessageCreatedEvent;
    }
  | {
      type: typeof DOMAIN_EVENT.turnChanged;
      payload: TurnChangedEvent;
    }
  | {
      type: typeof DOMAIN_EVENT.topicPhaseChanged;
      payload: TopicPhaseChangedEvent;
    };
