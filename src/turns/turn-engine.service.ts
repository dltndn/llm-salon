import { Injectable, NotFoundException } from '@nestjs/common';
import { ParticipantStatus, Prisma, Turn, TurnStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PlannedTurn, resolveNextTurns } from './turn-engine';

type TurnTransaction = Prisma.TransactionClient;

@Injectable()
export class TurnEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async advanceFromTurn(currentTurnId: string): Promise<Turn[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM turns WHERE id = ${currentTurnId}::uuid FOR UPDATE
      `;

      const currentTurn = await tx.turn.findUnique({
        where: { id: currentTurnId },
      });

      if (!currentTurn) {
        throw new NotFoundException(`Turn not found: ${currentTurnId}`);
      }

      return this.advanceFromCurrentTurn(tx, currentTurn);
    });
  }

  async advanceFromCurrentTurn(
    tx: TurnTransaction,
    currentTurn: Turn,
    currentTurnStatus: TurnStatus = TurnStatus.completed,
  ): Promise<Turn[]> {
    const [participants, roundStart] = await Promise.all([
      tx.participant.findMany({
        where: { projectId: currentTurn.projectId },
        orderBy: { joinOrder: 'asc' },
        select: {
          id: true,
          joinOrder: true,
          status: true,
          joinedAt: true,
        },
      }),
      this.findRoundStartedAt(tx, currentTurn),
    ]);

    const result = resolveNextTurns({
      participants,
      currentParticipantId: currentTurn.currentParticipantId,
      currentTurnIndex: currentTurn.turnIndex,
      currentRoundIndex: currentTurn.roundIndex,
      phase: currentTurn.phase,
      roundStartedAt: roundStart,
    });

    await tx.turn.update({
      where: { id: currentTurn.id },
      data:
        currentTurnStatus === TurnStatus.skipped
          ? { status: currentTurnStatus, currentParticipantId: null }
          : { status: currentTurnStatus },
    });

    if (result.plannedTurns.length === 0) {
      await tx.topic.update({
        where: { id: currentTurn.topicId },
        data: { version: { increment: 1 } },
      });
      return [];
    }

    const createdTurns: Turn[] = [];
    for (const plannedTurn of result.plannedTurns) {
      createdTurns.push(
        await this.createPlannedTurn(tx, currentTurn, plannedTurn),
      );
    }

    const lastTurn = createdTurns[createdTurns.length - 1];
    if (lastTurn?.status === TurnStatus.in_progress) {
      await tx.topic.update({
        where: { id: currentTurn.topicId },
        data: {
          currentRound: lastTurn.roundIndex,
          currentTurnIndex: lastTurn.turnIndex,
          version: { increment: 1 },
        },
      });
    } else {
      await tx.topic.update({
        where: { id: currentTurn.topicId },
        data: { version: { increment: 1 } },
      });
    }

    return createdTurns;
  }

  private async findRoundStartedAt(
    tx: TurnTransaction,
    currentTurn: Turn,
  ): Promise<Date> {
    const firstTurnInRound = await tx.turn.findFirst({
      where: {
        topicId: currentTurn.topicId,
        roundIndex: currentTurn.roundIndex,
      },
      orderBy: { turnIndex: 'asc' },
      select: { createdAt: true },
    });

    return firstTurnInRound?.createdAt ?? currentTurn.createdAt;
  }

  private createPlannedTurn(
    tx: TurnTransaction,
    currentTurn: Turn,
    plannedTurn: PlannedTurn,
  ): Promise<Turn> {
    return this.createPlannedTurnAndActivateParticipant(
      tx,
      currentTurn,
      plannedTurn,
    );
  }

  private async createPlannedTurnAndActivateParticipant(
    tx: TurnTransaction,
    currentTurn: Turn,
    plannedTurn: PlannedTurn,
  ): Promise<Turn> {
    const turn = await tx.turn.create({
      data: {
        projectId: currentTurn.projectId,
        topicId: currentTurn.topicId,
        currentParticipantId: plannedTurn.participantId,
        turnIndex: plannedTurn.turnIndex,
        roundIndex: plannedTurn.roundIndex,
        phase: plannedTurn.phase,
        status: plannedTurn.status,
      },
    });

    if (
      plannedTurn.status === TurnStatus.in_progress &&
      plannedTurn.participantId
    ) {
      await tx.participant.updateMany({
        where: {
          id: plannedTurn.participantId,
          status: ParticipantStatus.waiting,
        },
        data: { status: ParticipantStatus.active },
      });
    }

    return turn;
  }
}
