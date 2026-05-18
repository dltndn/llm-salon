import {
  ParticipantStatus,
  TopicPhase,
  Turn,
  TurnStatus,
} from '@prisma/client';

import { TurnEngineService } from '../turn-engine.service';

const now = new Date('2026-05-18T00:00:00.000Z');

function currentTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: 'turn-1',
    projectId: 'project-1',
    topicId: 'topic-1',
    currentParticipantId: 'member-a',
    turnIndex: 1,
    roundIndex: 0,
    phase: TopicPhase.debating,
    status: TurnStatus.in_progress,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createdTurn(data: {
  currentParticipantId: string | null;
  turnIndex: number;
  roundIndex: number;
  status: TurnStatus;
}): Turn {
  return currentTurn({
    id: `turn-${data.turnIndex}`,
    currentParticipantId: data.currentParticipantId,
    turnIndex: data.turnIndex,
    roundIndex: data.roundIndex,
    status: data.status,
  });
}

describe('TurnEngineService', () => {
  it('locks the current turn before advancing through the public path', async () => {
    const turn = currentTurn();
    const tx = {
      $queryRaw: jest.fn(),
      turn: {
        findUnique: jest.fn().mockResolvedValue(turn),
        findFirst: jest.fn().mockResolvedValue({ createdAt: now }),
        update: jest
          .fn()
          .mockResolvedValue({ ...turn, status: TurnStatus.completed }),
        create: jest
          .fn()
          .mockResolvedValue(
            createdTurn({
              currentParticipantId: 'member-b',
              turnIndex: 2,
              roundIndex: 0,
              status: TurnStatus.in_progress,
            }),
          ),
      },
      participant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'member-a',
            joinOrder: 1,
            status: ParticipantStatus.active,
            joinedAt: now,
          },
          {
            id: 'member-b',
            joinOrder: 2,
            status: ParticipantStatus.active,
            joinedAt: now,
          },
        ]),
      },
      topic: {
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };

    const service = new TurnEngineService(prisma as never);

    await service.advanceFromTurn('turn-1');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.turn.findUnique).toHaveBeenCalledWith({ where: { id: 'turn-1' } });
  });

  it('completes current turn, creates skipped and active rows, and updates topic pointer', async () => {
    const turn = currentTurn();
    const createdTurns: Turn[] = [
      createdTurn({
        currentParticipantId: null,
        turnIndex: 2,
        roundIndex: 0,
        status: TurnStatus.skipped,
      }),
      createdTurn({
        currentParticipantId: 'member-c',
        turnIndex: 3,
        roundIndex: 0,
        status: TurnStatus.in_progress,
      }),
    ];
    const tx = {
      turn: {
        findFirst: jest.fn().mockResolvedValue({ createdAt: now }),
        update: jest
          .fn()
          .mockResolvedValue({ ...turn, status: TurnStatus.completed }),
        create: jest
          .fn()
          .mockResolvedValueOnce(createdTurns[0])
          .mockResolvedValueOnce(createdTurns[1]),
      },
      participant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'member-a',
            joinOrder: 1,
            status: ParticipantStatus.active,
            joinedAt: now,
          },
          {
            id: 'member-b',
            joinOrder: 2,
            status: ParticipantStatus.inactive,
            joinedAt: now,
          },
          {
            id: 'member-c',
            joinOrder: 3,
            status: ParticipantStatus.waiting,
            joinedAt: now,
          },
        ]),
      },
      topic: {
        update: jest.fn(),
      },
    };

    const service = new TurnEngineService({} as never);
    await expect(
      service.advanceFromCurrentTurn(tx as never, turn),
    ).resolves.toEqual(createdTurns);

    expect(tx.turn.update).toHaveBeenCalledWith({
      where: { id: 'turn-1' },
      data: { status: TurnStatus.completed },
    });
    expect(tx.turn.create).toHaveBeenNthCalledWith(1, {
      data: {
        projectId: 'project-1',
        topicId: 'topic-1',
        currentParticipantId: null,
        turnIndex: 2,
        roundIndex: 0,
        phase: TopicPhase.debating,
        status: TurnStatus.skipped,
      },
    });
    expect(tx.turn.create).toHaveBeenNthCalledWith(2, {
      data: {
        projectId: 'project-1',
        topicId: 'topic-1',
        currentParticipantId: 'member-c',
        turnIndex: 3,
        roundIndex: 0,
        phase: TopicPhase.debating,
        status: TurnStatus.in_progress,
      },
    });
    expect(tx.topic.update).toHaveBeenCalledWith({
      where: { id: 'topic-1' },
      data: {
        currentRound: 0,
        currentTurnIndex: 3,
      },
    });
  });
});
