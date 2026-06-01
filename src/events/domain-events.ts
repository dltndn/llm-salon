import { Message, ParticipantStatus, Topic, Turn } from '@prisma/client';

export const DOMAIN_EVENT = {
  messageCreated: 'message.created',
  turnChanged: 'turn.changed',
  participantJoined: 'participant.joined',
  topicPhaseChanged: 'topic.phase_changed',
  reportDraftCreated: 'report.draft_created',
  reportCreated: 'report.created',
  projectClosed: 'project.closed',
} as const;

export type MessageCreatedEvent = {
  projectId: string;
  projectSlug: string;
  topicId: string;
  message: Message & {
    participant: { displayName: string; anonymousName: string };
  };
};

export type TurnChangedEvent = {
  projectId: string;
  projectSlug: string;
  topicId: string;
  turn: Turn & {
    currentParticipant: { displayName: string };
  };
};

export type ParticipantJoinedEvent = {
  projectId: string;
  projectSlug: string;
  participant: {
    id: string;
    displayName: string;
    status: ParticipantStatus;
  };
};

export type TopicPhaseChangedEvent = {
  projectId: string;
  projectSlug: string;
  topicId: string;
  phase: Topic['phase'];
};

export type ReportDraftCreatedEvent = {
  projectId: string;
  projectSlug: string;
  topicId: string;
  reportId: string;
};

export type ReportCreatedEvent = {
  projectId: string;
  projectSlug: string;
  topicId: string;
  report: {
    id: string;
    filePath: string | null;
  };
};

export type ProjectClosedEvent = {
  projectId: string;
  projectSlug: string;
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
      type: typeof DOMAIN_EVENT.participantJoined;
      payload: ParticipantJoinedEvent;
    }
  | {
      type: typeof DOMAIN_EVENT.topicPhaseChanged;
      payload: TopicPhaseChangedEvent;
    }
  | {
      type: typeof DOMAIN_EVENT.reportDraftCreated;
      payload: ReportDraftCreatedEvent;
    }
  | {
      type: typeof DOMAIN_EVENT.reportCreated;
      payload: ReportCreatedEvent;
    }
  | {
      type: typeof DOMAIN_EVENT.projectClosed;
      payload: ProjectClosedEvent;
    };
