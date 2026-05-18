import { ParticipantStatus, TopicPhase, TurnStatus } from '@prisma/client';

export type TurnParticipant = {
  id: string;
  joinOrder: number;
  status: ParticipantStatus;
  joinedAt: Date;
};

export type TurnEngineInput = {
  participants: TurnParticipant[];
  currentParticipantId: string | null;
  currentTurnIndex: number;
  currentRoundIndex: number;
  phase: TopicPhase;
  roundStartedAt: Date;
};

export type PlannedTurn = {
  participantId: string | null;
  turnIndex: number;
  roundIndex: number;
  phase: TopicPhase;
  status: TurnStatus;
};

export type TurnEngineResult = {
  plannedTurns: PlannedTurn[];
  nextParticipantId: string | null;
  nextTurnIndex: number;
  nextRoundIndex: number;
};

const ELIGIBLE_STATUSES = new Set<ParticipantStatus>([
  ParticipantStatus.active,
  ParticipantStatus.waiting,
]);

export function resolveNextTurns(input: TurnEngineInput): TurnEngineResult {
  const participants = [...input.participants].sort(
    (left, right) => left.joinOrder - right.joinOrder,
  );

  const currentJoinOrder =
    participants.find((item) => item.id === input.currentParticipantId)
      ?.joinOrder ?? 0;
  const sameRoundParticipants = participants.filter(
    (participant) =>
      participant.joinOrder > currentJoinOrder &&
      participant.joinedAt <= input.roundStartedAt,
  );
  const sameRoundResult = planFromParticipants({
    participants: sameRoundParticipants,
    turnIndex: input.currentTurnIndex + 1,
    roundIndex: input.currentRoundIndex,
    phase: input.phase,
  });

  if (sameRoundResult.nextParticipantId) {
    return sameRoundResult;
  }

  const nextRoundResult = planFromParticipants({
    participants,
    turnIndex: sameRoundResult.nextTurnIndex,
    roundIndex: input.currentRoundIndex + 1,
    phase: input.phase,
  });

  return {
    plannedTurns: [
      ...sameRoundResult.plannedTurns,
      ...nextRoundResult.plannedTurns,
    ],
    nextParticipantId: nextRoundResult.nextParticipantId,
    nextTurnIndex: nextRoundResult.nextTurnIndex,
    nextRoundIndex: nextRoundResult.nextRoundIndex,
  };
}

function planFromParticipants(input: {
  participants: TurnParticipant[];
  turnIndex: number;
  roundIndex: number;
  phase: TopicPhase;
}): TurnEngineResult {
  const plannedTurns: PlannedTurn[] = [];
  let turnIndex = input.turnIndex;

  for (const participant of input.participants) {
    if (ELIGIBLE_STATUSES.has(participant.status)) {
      plannedTurns.push({
        participantId: participant.id,
        turnIndex,
        roundIndex: input.roundIndex,
        phase: input.phase,
        status: TurnStatus.in_progress,
      });

      return {
        plannedTurns,
        nextParticipantId: participant.id,
        nextTurnIndex: turnIndex,
        nextRoundIndex: input.roundIndex,
      };
    }

    plannedTurns.push({
      participantId: null,
      turnIndex,
      roundIndex: input.roundIndex,
      phase: input.phase,
      status: TurnStatus.skipped,
    });
    turnIndex += 1;
  }

  return {
    plannedTurns,
    nextParticipantId: null,
    nextTurnIndex: turnIndex,
    nextRoundIndex: input.roundIndex,
  };
}
