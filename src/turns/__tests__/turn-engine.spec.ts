import { ParticipantStatus, TopicPhase, TurnStatus } from '@prisma/client';

import { resolveNextTurns, TurnParticipant } from '../turn-engine';

const roundStartedAt = new Date('2026-05-18T00:00:00.000Z');
const beforeRound = new Date('2026-05-17T23:59:00.000Z');
const afterRound = new Date('2026-05-18T00:01:00.000Z');
const nextRoundStartedAt = new Date('2026-05-18T00:02:00.000Z');

function participant(
  id: string,
  joinOrder: number,
  status: ParticipantStatus = ParticipantStatus.active,
  joinedAt = beforeRound,
): TurnParticipant {
  return { id, joinOrder, status, joinedAt };
}

describe('resolveNextTurns', () => {
  it.each([
    {
      name: 'normal rotation follows join order',
      participants: [
        participant('member-a', 1),
        participant('member-b', 2),
        participant('member-c', 3),
      ],
      currentParticipantId: 'member-a',
      currentTurnIndex: 1,
      currentRoundIndex: 0,
      expectedTurns: [
        {
          participantId: 'member-b',
          turnIndex: 2,
          roundIndex: 0,
          status: TurnStatus.in_progress,
        },
      ],
      expectedNextParticipantId: 'member-b',
      expectedNextRoundIndex: 0,
    },
    {
      name: 'inactive and removed participants are recorded as skipped',
      participants: [
        participant('member-a', 1),
        participant('member-b', 2, ParticipantStatus.inactive),
        participant('member-c', 3, ParticipantStatus.removed),
        participant('member-d', 4, ParticipantStatus.waiting),
      ],
      currentParticipantId: 'member-a',
      currentTurnIndex: 1,
      currentRoundIndex: 0,
      expectedTurns: [
        {
          participantId: null,
          turnIndex: 2,
          roundIndex: 0,
          status: TurnStatus.skipped,
        },
        {
          participantId: null,
          turnIndex: 3,
          roundIndex: 0,
          status: TurnStatus.skipped,
        },
        {
          participantId: 'member-d',
          turnIndex: 4,
          roundIndex: 0,
          status: TurnStatus.in_progress,
        },
      ],
      expectedNextParticipantId: 'member-d',
      expectedNextRoundIndex: 0,
    },
    {
      name: 'round index increments when rotation wraps',
      participants: [participant('member-a', 1), participant('member-b', 2)],
      currentParticipantId: 'member-b',
      currentTurnIndex: 2,
      currentRoundIndex: 0,
      expectedTurns: [
        {
          participantId: 'member-a',
          turnIndex: 3,
          roundIndex: 1,
          status: TurnStatus.in_progress,
        },
      ],
      expectedNextParticipantId: 'member-a',
      expectedNextRoundIndex: 1,
    },
    {
      name: 'late joiners wait until the next round candidate pool',
      participants: [
        participant('member-a', 1),
        participant('member-b', 2),
        participant('member-c', 3, ParticipantStatus.waiting, afterRound),
      ],
      currentParticipantId: 'member-b',
      currentTurnIndex: 2,
      currentRoundIndex: 0,
      expectedTurns: [
        {
          participantId: 'member-a',
          turnIndex: 3,
          roundIndex: 1,
          status: TurnStatus.in_progress,
        },
      ],
      expectedNextParticipantId: 'member-a',
      expectedNextRoundIndex: 1,
    },
    {
      name: 'late joiner becomes eligible after earlier next-round speakers',
      participants: [
        participant('member-a', 1),
        participant('member-b', 2),
        participant('member-c', 3, ParticipantStatus.waiting, afterRound),
      ],
      currentParticipantId: 'member-b',
      currentTurnIndex: 4,
      currentRoundIndex: 1,
      roundStartedAt: nextRoundStartedAt,
      expectedTurns: [
        {
          participantId: 'member-c',
          turnIndex: 5,
          roundIndex: 1,
          status: TurnStatus.in_progress,
        },
      ],
      expectedNextParticipantId: 'member-c',
      expectedNextRoundIndex: 1,
    },
    {
      name: 'single participant wraps to the next round',
      participants: [participant('member-a', 1)],
      currentParticipantId: 'member-a',
      currentTurnIndex: 1,
      currentRoundIndex: 0,
      expectedTurns: [
        {
          participantId: 'member-a',
          turnIndex: 2,
          roundIndex: 1,
          status: TurnStatus.in_progress,
        },
      ],
      expectedNextParticipantId: 'member-a',
      expectedNextRoundIndex: 1,
    },
    {
      name: 'rejoined active participant is eligible in join order',
      participants: [
        participant('member-a', 1),
        participant('member-b', 2, ParticipantStatus.active),
        participant('member-c', 3),
      ],
      currentParticipantId: 'member-a',
      currentTurnIndex: 1,
      currentRoundIndex: 0,
      expectedTurns: [
        {
          participantId: 'member-b',
          turnIndex: 2,
          roundIndex: 0,
          status: TurnStatus.in_progress,
        },
      ],
      expectedNextParticipantId: 'member-b',
      expectedNextRoundIndex: 0,
    },
  ])(
    '$name',
    ({
      participants,
      currentParticipantId,
      currentTurnIndex,
      currentRoundIndex,
      roundStartedAt: startedAt = roundStartedAt,
      expectedTurns,
      expectedNextParticipantId,
      expectedNextRoundIndex,
    }) => {
      const result = resolveNextTurns({
        participants,
        currentParticipantId,
        currentTurnIndex,
        currentRoundIndex,
        phase: TopicPhase.debating,
        roundStartedAt: startedAt,
      });

      expect(result.plannedTurns).toEqual(
        expectedTurns.map((turn) => ({
          ...turn,
          phase: TopicPhase.debating,
        })),
      );
      expect(result.nextParticipantId).toBe(expectedNextParticipantId);
      expect(result.nextRoundIndex).toBe(expectedNextRoundIndex);
    },
  );
});
