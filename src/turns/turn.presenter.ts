import { Topic, Turn } from '@prisma/client';

type TurnWithParticipant = Turn & {
  currentParticipant?: { id: string; anonymousName: string } | null;
};

export type TurnStatusResponse = {
  currentMember: string | null;
  phase: string;
  currentRound: number;
  currentTurnIndex: number;
  serverTime: string;
  topicVersion: number;
  isMyTurn?: boolean;
  mySelf?: string | null;
};

export type TurnWaitWakeupReason =
  | 'turn_changed'
  | 'phase_changed'
  | 'topic_updated'
  | 'timeout'
  | 'closed';

export type TurnWaitResponse = TurnStatusResponse & {
  isMyTurn: boolean;
  mySelf: string | null;
  wakeupReason: TurnWaitWakeupReason;
};

export function serializeTurnStatus(input: {
  topic: Topic;
  turn: TurnWithParticipant | null;
  participant?: { id: string; anonymousName: string } | null;
}): TurnStatusResponse {
  return {
    currentMember: input.turn?.currentParticipant?.anonymousName ?? null,
    phase: input.topic.phase,
    currentRound: input.topic.currentRound,
    currentTurnIndex: input.topic.currentTurnIndex,
    serverTime: new Date().toISOString(),
    topicVersion: input.topic.version,
    ...(input.participant
      ? {
          isMyTurn:
            input.turn?.currentParticipant?.id === input.participant.id,
          mySelf: input.participant.anonymousName,
        }
      : {}),
  };
}
