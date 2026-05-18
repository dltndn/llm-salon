import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MessageKind,
  ParticipantStatus,
  Prisma,
  Topic,
  TopicPhase,
  Turn,
  TurnStatus,
} from '@prisma/client';

import {
  PhaseTransitionError,
  WrongTurnError,
} from '../common/errors/domain.errors';
import { DOMAIN_EVENT, DomainEvent } from '../events/domain-events';
import { DomainEventBus } from '../events/event-bus';
import { PrismaService } from '../prisma/prisma.service';
import { TurnEngineService } from '../turns/turn-engine.service';
import { SubmitMessageDto } from './dto/submit-message.dto';
import {
  serializeSubmittedMessage,
  SubmittedMessageDto,
} from './message.presenter';

type MessageTransaction = Prisma.TransactionClient;
type TurnWithParticipant = Turn & {
  currentParticipant: {
    anonymousName: string;
    displayName: string;
  };
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly turnEngine: TurnEngineService,
    private readonly events: DomainEventBus,
  ) {}

  async submitMessage(
    projectSlug: string,
    topicId: string,
    dto: SubmitMessageDto,
  ): Promise<SubmittedMessageDto> {
    const domainEvents: DomainEvent[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const { projectId, topic } = await this.findTopic(tx, projectSlug, topicId);
      const currentTurn = await this.lockAndFindCurrentTurn(tx, topic.id);

      this.assertCurrentTurn(currentTurn, dto.participantId);

      const phaseAfter = await this.resolvePhaseAfterMessage(
        tx,
        topic,
        currentTurn,
      );
      const message = await tx.message.create({
        data: {
          projectId,
          topicId: topic.id,
          participantId: dto.participantId,
          kind: MessageKind.statement,
          turnIndex: currentTurn.turnIndex,
          roundIndex: currentTurn.roundIndex,
          phase: topic.phase,
          content: dto.content,
        },
        include: {
          participant: {
            select: { displayName: true },
          },
        },
      });

      domainEvents.push({
        type: DOMAIN_EVENT.messageCreated,
        payload: { projectId, projectSlug, topicId: topic.id, message },
      });

      if (phaseAfter === TopicPhase.drafting) {
        await tx.turn.update({
          where: { id: currentTurn.id },
          data: { status: TurnStatus.completed },
        });
        await this.transitionTopic(
          tx,
          topic,
          projectSlug,
          phaseAfter,
          domainEvents,
        );

        return { message, nextTurn: null, phaseAfter };
      }

      if (phaseAfter !== topic.phase) {
        await this.transitionTopic(
          tx,
          topic,
          projectSlug,
          phaseAfter,
          domainEvents,
        );
      }

      const createdTurns = await this.turnEngine.advanceFromCurrentTurn(tx, {
        ...currentTurn,
        phase: phaseAfter,
      });
      const nextTurn = await this.findNextTurnWithParticipant(tx, createdTurns);

      if (nextTurn) {
        domainEvents.push({
          type: DOMAIN_EVENT.turnChanged,
          payload: { projectId, projectSlug, topicId: topic.id, turn: nextTurn },
        });
      }

      return { message, nextTurn, phaseAfter };
    });

    for (const event of domainEvents) {
      this.events.emit(event);
    }

    return serializeSubmittedMessage({
      messageId: result.message.id,
      nextTurn: result.nextTurn,
      phaseAfter: result.phaseAfter,
    });
  }

  private async findTopic(
    tx: MessageTransaction,
    projectSlug: string,
    topicId: string,
  ): Promise<{ projectId: string; projectSlug: string; topic: Topic }> {
    const project = await tx.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true, slug: true },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectSlug}`);
    }

    const topic = await tx.topic.findFirst({
      where: {
        id: topicId,
        projectId: project.id,
      },
    });

    if (!topic) {
      throw new NotFoundException(`Topic not found: ${topicId}`);
    }

    return { projectId: project.id, projectSlug: project.slug, topic };
  }

  private async lockAndFindCurrentTurn(
    tx: MessageTransaction,
    topicId: string,
  ): Promise<TurnWithParticipant | null> {
    const current = await tx.turn.findFirst({
      where: {
        topicId,
        status: TurnStatus.in_progress,
      },
      orderBy: { turnIndex: 'desc' },
      select: { id: true },
    });

    if (!current) {
      return null;
    }

    await tx.$queryRaw`
      SELECT id FROM turns WHERE id = ${current.id}::uuid FOR UPDATE
    `;

    return tx.turn.findUnique({
      where: { id: current.id },
      include: {
        currentParticipant: {
          select: { anonymousName: true, displayName: true },
        },
      },
    }) as Promise<TurnWithParticipant | null>;
  }

  private assertCurrentTurn(
    currentTurn: TurnWithParticipant | null,
    participantId: string,
  ): asserts currentTurn is TurnWithParticipant {
    if (
      !currentTurn ||
      currentTurn.status !== TurnStatus.in_progress ||
      currentTurn.currentParticipantId !== participantId
    ) {
      throw new WrongTurnError(
        currentTurn?.currentParticipant?.anonymousName ?? null,
      );
    }
  }

  private async resolvePhaseAfterMessage(
    tx: MessageTransaction,
    topic: Topic,
    currentTurn: Turn,
  ): Promise<TopicPhase> {
    if (topic.phase === TopicPhase.preparing) {
      return TopicPhase.debating;
    }

    if (
      topic.phase === TopicPhase.debating &&
      (await this.reachedDebateLimit(tx, topic, currentTurn))
    ) {
      return TopicPhase.drafting;
    }

    if (topic.phase !== TopicPhase.debating) {
      throw new PhaseTransitionError(topic.phase, topic.phase);
    }

    return topic.phase;
  }

  private async reachedDebateLimit(
    tx: MessageTransaction,
    topic: Topic,
    currentTurn: Turn,
  ): Promise<boolean> {
    if (topic.maxTurns !== null && currentTurn.turnIndex >= topic.maxTurns) {
      return true;
    }

    if (
      topic.maxRounds === null ||
      currentTurn.roundIndex + 1 < topic.maxRounds
    ) {
      return false;
    }

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
      tx.turn.findFirst({
        where: {
          topicId: currentTurn.topicId,
          roundIndex: currentTurn.roundIndex,
        },
        orderBy: { turnIndex: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    const currentParticipant = participants.find(
      (participant) => participant.id === currentTurn.currentParticipantId,
    );

    if (!currentParticipant) {
      return true;
    }

    const roundStartedAt = roundStart?.createdAt ?? currentTurn.createdAt;
    return !participants.some(
      (participant) =>
        participant.joinOrder > currentParticipant.joinOrder &&
        participant.joinedAt <= roundStartedAt &&
        (participant.status === ParticipantStatus.active ||
          participant.status === ParticipantStatus.waiting),
    );
  }

  private async transitionTopic(
    tx: MessageTransaction,
    topic: Topic,
    projectSlug: string,
    phase: TopicPhase,
    domainEvents: DomainEvent[],
  ): Promise<void> {
    if (!this.isAllowedTransition(topic.phase, phase)) {
      throw new PhaseTransitionError(topic.phase, phase);
    }

    await tx.topic.update({
      where: { id: topic.id },
      data: { phase },
    });
    domainEvents.push({
      type: DOMAIN_EVENT.topicPhaseChanged,
      payload: {
        projectId: topic.projectId,
        projectSlug,
        topicId: topic.id,
        phase,
      },
    });
  }

  private isAllowedTransition(from: TopicPhase, to: TopicPhase): boolean {
    return (
      (from === TopicPhase.preparing && to === TopicPhase.debating) ||
      (from === TopicPhase.debating && to === TopicPhase.drafting)
    );
  }

  private async findNextTurnWithParticipant(
    tx: MessageTransaction,
    createdTurns: Turn[],
  ): Promise<TurnWithParticipant | null> {
    const nextTurn = [...createdTurns]
      .reverse()
      .find((turn) => turn.status === TurnStatus.in_progress);

    if (!nextTurn) {
      return null;
    }

    return tx.turn.findUnique({
      where: { id: nextTurn.id },
      include: {
        currentParticipant: {
          select: { anonymousName: true, displayName: true },
        },
      },
    }) as Promise<TurnWithParticipant | null>;
  }
}
