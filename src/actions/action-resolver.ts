import {
  MessageKind,
  ParticipantStatus,
  ParticipantType,
  Topic,
  TopicPhase,
} from '@prisma/client';

export type ActionType =
  | 'submit_debate_message'
  | 'submit_review_feedback'
  | 'submit_report_draft'
  | 'submit_report_final'
  | 'none';

export type ResolvedCallerAction = {
  isActionable: boolean;
  action: ActionType;
  assignedMember: string | null;
};

type TurnWithSpeaker = {
  currentParticipant?: { id: string; anonymousName: string } | null;
};

type ReporterParticipant = {
  id: string;
  anonymousName: string;
  participantType: ParticipantType;
};

export async function resolveCallerAction(input: {
  topic: Topic;
  participant: {
    id: string;
    anonymousName: string;
    status: ParticipantStatus;
    participantType: ParticipantType;
  };
  turn: TurnWithSpeaker | null;
  reporter: ReporterParticipant | null;
  hasFeedback: boolean;
}): Promise<ResolvedCallerAction> {
  const { topic, participant, turn, reporter, hasFeedback } = input;

  if (
    topic.phase === TopicPhase.finalized ||
    topic.phase === TopicPhase.closed
  ) {
    return { isActionable: false, action: 'none', assignedMember: null };
  }

  if (
    topic.phase === TopicPhase.debating ||
    topic.phase === TopicPhase.preparing
  ) {
    const currentMember = turn?.currentParticipant?.anonymousName ?? null;

    if (turn?.currentParticipant?.id === participant.id) {
      return {
        isActionable: true,
        action: 'submit_debate_message',
        assignedMember: currentMember,
      };
    }

    return {
      isActionable: false,
      action: 'none',
      assignedMember: currentMember,
    };
  }

  if (topic.phase === TopicPhase.reviewing) {
    if (
      participant.status === ParticipantStatus.active &&
      !hasFeedback
    ) {
      return {
        isActionable: true,
        action: 'submit_review_feedback',
        assignedMember: participant.anonymousName,
      };
    }

    return { isActionable: false, action: 'none', assignedMember: null };
  }

  if (topic.phase === TopicPhase.drafting) {
    const assignedMember = reporter?.anonymousName ?? null;

    if (
      reporter?.id === participant.id &&
      reporter.participantType === ParticipantType.app
    ) {
      return {
        isActionable: true,
        action: 'submit_report_draft',
        assignedMember,
      };
    }

    return { isActionable: false, action: 'none', assignedMember };
  }

  if (topic.phase === TopicPhase.finalizing) {
    const assignedMember = reporter?.anonymousName ?? null;

    if (
      reporter?.id === participant.id &&
      reporter.participantType === ParticipantType.app
    ) {
      return {
        isActionable: true,
        action: 'submit_report_final',
        assignedMember,
      };
    }

    return { isActionable: false, action: 'none', assignedMember };
  }

  return { isActionable: false, action: 'none', assignedMember: null };
}

export function isClosedPhase(phase: string): boolean {
  return phase === TopicPhase.finalized || phase === TopicPhase.closed;
}

export function isWaitablePhase(
  phase: string,
  isActionable: boolean,
): boolean {
  if (isClosedPhase(phase)) {
    return false;
  }

  if (
    phase === TopicPhase.preparing ||
    phase === TopicPhase.debating ||
    phase === TopicPhase.reviewing ||
    phase === TopicPhase.drafting ||
    phase === TopicPhase.finalizing
  ) {
    return true;
  }

  return isActionable;
}

export async function participantHasFeedback(
  prisma: {
    message: {
      findFirst: (args: {
        where: {
          topicId: string;
          participantId: string;
          kind: MessageKind;
        };
        select: { id: true };
      }) => Promise<{ id: string } | null>;
    };
  },
  topicId: string,
  participantId: string,
): Promise<boolean> {
  const existingFeedback = await prisma.message.findFirst({
    where: {
      topicId,
      participantId,
      kind: MessageKind.feedback,
    },
    select: { id: true },
  });

  return existingFeedback !== null;
}
