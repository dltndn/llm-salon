import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DebateSignal,
  MessageKind,
  ParticipantStatus,
  Prisma,
  ReportStatus,
  Topic,
  TopicMode,
  TopicPhase,
  Turn,
  TurnStatus,
} from '@prisma/client';

import {
  ParticipantConflictError,
  PhaseTransitionError,
  WrongTurnError,
} from '../common/errors/domain.errors';
import { toPrismaDebateSignal } from '../common/debate-signal';
import { DOMAIN_EVENT, DomainEvent } from '../events/domain-events';
import { DomainEventBus } from '../events/event-bus';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
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
    private readonly reportsService: ReportsService,
    private readonly events: DomainEventBus,
  ) {}

  async submitMessage(
    projectSlug: string,
    topicId: string,
    dto: SubmitMessageDto,
  ): Promise<SubmittedMessageDto> {
    const domainEvents: DomainEvent[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const { projectId, projectSlug: slug, topic } = await this.findTopic(
        tx,
        projectSlug,
        topicId,
      );

      if (topic.phase === TopicPhase.reviewing) {
        return this.submitFeedback(tx, {
          projectId,
          projectSlug: slug,
          topic,
          dto,
          domainEvents,
        });
      }

      const currentTurn = await this.lockAndFindCurrentTurn(tx, topic.id);

      this.assertCurrentTurn(currentTurn, dto.participantId);

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
          debateSignal: toPrismaDebateSignal(dto.debateSignal),
        },
        include: {
          participant: {
            select: { displayName: true, anonymousName: true },
          },
        },
      });

      domainEvents.push({
        type: DOMAIN_EVENT.messageCreated,
        payload: { projectId, projectSlug, topicId: topic.id, message },
      });
      await this.incrementTopicVersion(tx, topic.id);

      const phaseAfter = await this.resolvePhaseAfterMessage(
        tx,
        topic,
        currentTurn,
      );

      if (phaseAfter === TopicPhase.drafting) {
        await tx.turn.update({
          where: { id: currentTurn.id },
          data: { status: TurnStatus.completed },
        });
        await this.incrementTopicVersion(tx, topic.id);
        await this.reportsService.beginDrafting(tx, {
          projectId,
          projectSlug,
          topic,
          domainEvents,
        });

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
      ((await this.reachedDebateLimit(tx, topic, currentTurn)) ||
        (await this.reachedConsensusReadiness(tx, topic, currentTurn)))
    ) {
      return TopicPhase.drafting;
    }

    if (topic.phase !== TopicPhase.debating) {
      throw new PhaseTransitionError(topic.phase, topic.phase);
    }

    return topic.phase;
  }

  private async reachedConsensusReadiness(
    tx: MessageTransaction,
    topic: Topic,
    currentTurn: Turn,
  ): Promise<boolean> {
    if (topic.mode !== TopicMode.consensus) {
      return false;
    }

    const [participants, roundStart] = await Promise.all([
      tx.participant.findMany({
        where: {
          projectId: topic.projectId,
          status: { in: [ParticipantStatus.active, ParticipantStatus.waiting] },
        },
        orderBy: { joinOrder: 'asc' },
        select: { id: true, joinOrder: true, status: true, joinedAt: true },
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
    const roundStartedAt = roundStart?.createdAt ?? currentTurn.createdAt;
    const pendingCurrentRoundParticipants = participants.filter(
      (participant) =>
        participant.status === ParticipantStatus.waiting &&
        currentParticipant !== undefined &&
        participant.joinOrder > currentParticipant.joinOrder &&
        participant.joinedAt <= roundStartedAt,
    );

    if (
      await this.hasUnassignedCurrentRoundParticipant(
        tx,
        topic.id,
        pendingCurrentRoundParticipants.map((participant) => participant.id),
      )
    ) {
      return false;
    }

    const activeParticipants = participants.filter(
      (participant) => participant.status === ParticipantStatus.active,
    );

    if (activeParticipants.length === 0) {
      return false;
    }

    const activeParticipantIds = activeParticipants.map(
      (participant) => participant.id,
    );
    const statements = await tx.message.findMany({
      where: {
        topicId: topic.id,
        kind: MessageKind.statement,
        phase: TopicPhase.debating,
        participantId: { in: activeParticipantIds },
      },
      orderBy: { turnIndex: 'asc' },
      select: {
        participantId: true,
        debateSignal: true,
      },
    });
    const latestSignalsByParticipantId = new Map<string, DebateSignal>();

    for (const statement of statements) {
      latestSignalsByParticipantId.set(
        statement.participantId,
        statement.debateSignal,
      );
    }

    return activeParticipants.every(
      (participant) =>
        latestSignalsByParticipantId.get(participant.id) ===
        DebateSignal.ReadyToFinalize,
    );
  }

  private async hasUnassignedCurrentRoundParticipant(
    tx: MessageTransaction,
    topicId: string,
    participantIds: string[],
  ): Promise<boolean> {
    if (participantIds.length === 0) {
      return false;
    }

    const assignedTurns = await tx.turn.findMany({
      where: {
        topicId,
        currentParticipantId: { in: participantIds },
        status: { not: TurnStatus.skipped },
      },
      select: { currentParticipantId: true },
    });
    const assignedParticipantIds = new Set(
      assignedTurns
        .map((turn) => turn.currentParticipantId)
        .filter((participantId): participantId is string => participantId !== null),
    );

    return participantIds.some(
      (participantId) => !assignedParticipantIds.has(participantId),
    );
  }

  private async submitFeedback(
    tx: MessageTransaction,
    params: {
      projectId: string;
      projectSlug: string;
      topic: Topic;
      dto: SubmitMessageDto;
      domainEvents: DomainEvent[];
    },
  ): Promise<{
    message: Awaited<ReturnType<MessageTransaction['message']['create']>>;
    nextTurn: null;
    phaseAfter: TopicPhase;
  }> {
    const { projectId, projectSlug, topic, dto, domainEvents } = params;

    await tx.$queryRaw`
      SELECT id FROM topics WHERE id = ${topic.id}::uuid FOR UPDATE
    `;

    const participant = await tx.participant.findFirst({
      where: {
        id: dto.participantId,
        projectId,
        status: ParticipantStatus.active,
      },
    });

    if (!participant) {
      throw new WrongTurnError(null);
    }

    const existingFeedback = await tx.message.findFirst({
      where: {
        topicId: topic.id,
        participantId: dto.participantId,
        kind: MessageKind.feedback,
      },
      select: { id: true },
    });

    if (existingFeedback) {
      throw new ParticipantConflictError(
        'Feedback has already been submitted for this topic.',
      );
    }

    const message = await tx.message.create({
      data: {
        projectId,
        topicId: topic.id,
        participantId: dto.participantId,
        kind: MessageKind.feedback,
        turnIndex: topic.currentTurnIndex,
        roundIndex: topic.currentRound,
        phase: TopicPhase.reviewing,
        content: dto.content,
      },
      include: {
        participant: {
          select: { displayName: true, anonymousName: true },
        },
      },
    });

    domainEvents.push({
      type: DOMAIN_EVENT.messageCreated,
      payload: { projectId, projectSlug, topicId: topic.id, message },
    });
    await this.incrementTopicVersion(tx, topic.id);

    const phaseAfter = await this.maybeAdvanceToFinalizing(
      tx,
      topic,
      projectSlug,
      domainEvents,
    );

    return { message, nextTurn: null, phaseAfter };
  }

  private async maybeAdvanceToFinalizing(
    tx: MessageTransaction,
    topic: Topic,
    projectSlug: string,
    domainEvents: DomainEvent[],
  ): Promise<TopicPhase> {
    const [activeParticipants, feedbackMessages, reports] = await Promise.all([
      tx.participant.findMany({
        where: {
          projectId: topic.projectId,
          status: ParticipantStatus.active,
        },
        select: { id: true },
      }),
      tx.message.findMany({
        where: { topicId: topic.id, kind: MessageKind.feedback },
        select: { participantId: true },
      }),
      tx.report.findMany({
        where: { projectId: topic.projectId, topicId: topic.id },
        take: 2,
        select: {
          id: true,
          status: true,
          draftContent: true,
          finalContent: true,
        },
      }),
    ]);

    const feedbackParticipantIds = new Set(
      feedbackMessages.map((message) => message.participantId),
    );
    const allFeedbackReceived = activeParticipants.every((participant) =>
      feedbackParticipantIds.has(participant.id),
    );

    const report = this.resolveReportForFinalizing(reports);

    if (!allFeedbackReceived || !report) {
      return TopicPhase.reviewing;
    }

    await tx.report.update({
      where: { id: report.id },
      data: { status: ReportStatus.finalizing },
    });
    await this.transitionTopic(
      tx,
      topic,
      projectSlug,
      TopicPhase.finalizing,
      domainEvents,
    );

    return TopicPhase.finalizing;
  }

  private resolveReportForFinalizing(
    reports: Array<{
      id: string;
      status: ReportStatus;
      draftContent: string | null;
      finalContent: string | null;
    }>,
  ): { id: string } | null {
    if (reports.length !== 1) {
      return null;
    }

    const [report] = reports;

    if (
      report.status !== ReportStatus.reviewing ||
      report.draftContent === null ||
      report.finalContent !== null
    ) {
      return null;
    }

    return { id: report.id };
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
      data: { phase, version: { increment: 1 } },
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

  private async incrementTopicVersion(
    tx: MessageTransaction,
    topicId: string,
  ): Promise<void> {
    await tx.topic.update({
      where: { id: topicId },
      data: { version: { increment: 1 } },
    });
  }

  private isAllowedTransition(from: TopicPhase, to: TopicPhase): boolean {
    return (
      (from === TopicPhase.preparing && to === TopicPhase.debating) ||
      (from === TopicPhase.debating && to === TopicPhase.drafting) ||
      (from === TopicPhase.reviewing && to === TopicPhase.finalizing)
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
