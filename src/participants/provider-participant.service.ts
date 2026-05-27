import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  DebateSignal,
  MessageKind,
  Participant,
  ParticipantType,
  Prisma,
  Project,
  Topic,
  Turn,
  TurnStatus,
} from '@prisma/client';

import type {
  MessageAnonymousDto,
  ProjectAnonymousDto,
  TopicAnonymousDto,
} from '../common/dto';
import {
  DebateSignalValue,
  fromPrismaDebateSignal,
  isDebateSignalValue,
} from '../common/debate-signal';
import {
  DOMAIN_EVENT,
  DomainEvent,
  TurnChangedEvent,
} from '../events/domain-events';
import { DomainEventBus } from '../events/event-bus';
import { LlmProviderRegistry } from '../llm/llm-provider.registry';
import { ProviderCallFailedError } from '../llm/llm.errors';
import { MessagesService } from '../messages/messages.service';
import {
  ContextBuilderInput,
  ContextBuilderService,
} from '../prompt/context-builder.service';
import { SummaryParticipant } from '../prompt/summarizer.service';
import { PrismaService } from '../prisma/prisma.service';
import { maskLogMessage } from '../security/masking.interceptor';
import { TurnEngineService } from '../turns/turn-engine.service';

type ProviderTurn = Turn & {
  currentParticipant: Participant;
};

type AutoSpeakTransaction = Prisma.TransactionClient;
type ProviderGeneratedMessage = {
  content: string;
  debateSignal: DebateSignalValue;
};

@Injectable()
export class ProviderParticipantService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProviderParticipantService.name);
  private unsubscribeFromTurnChanged: (() => void) | null = null;
  private readonly inFlightTurns = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
    private readonly registry: LlmProviderRegistry,
    private readonly messages: MessagesService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly turnEngine: TurnEngineService,
  ) {}

  onModuleInit(): void {
    this.unsubscribeFromTurnChanged = this.events.on(
      DOMAIN_EVENT.turnChanged,
      (payload) => {
        void this.speakIfProviderTurn(payload);
      },
    );
  }

  onModuleDestroy(): void {
    this.unsubscribeFromTurnChanged?.();
  }

  async speakIfProviderTurn(payload: TurnChangedEvent): Promise<void> {
    const turnId = payload.turn.id;

    if (this.inFlightTurns.has(turnId)) {
      return;
    }

    this.inFlightTurns.add(turnId);
    try {
      let turn: ProviderTurn | null;
      try {
        turn = await this.findProviderTurn(turnId);
      } catch (error) {
        this.logger.warn(
          `Provider auto-speak turn lookup failed: ${this.formatLogError(error)}`,
        );
        return;
      }

      if (!turn) {
        return;
      }

      let message: ProviderGeneratedMessage;
      try {
        message = await this.generateProviderMessage(
          payload.projectSlug,
          payload.topicId,
          turn,
        );
      } catch (error) {
        await this.skipProviderTurn(payload, error);
        return;
      }

      try {
        await this.messages.submitMessage(payload.projectSlug, payload.topicId, {
          participantId: turn.currentParticipant.id,
          content: message.content,
          debateSignal: message.debateSignal,
        });
      } catch (error) {
        this.logger.warn(
          `Provider auto-speak message submit failed: ${this.formatLogError(error)}`,
        );
      }
    } finally {
      this.inFlightTurns.delete(turnId);
    }
  }

  private async findProviderTurn(turnId: string): Promise<ProviderTurn | null> {
    const turn = (await this.prisma.turn.findUnique({
      where: { id: turnId },
      include: {
        currentParticipant: true,
      },
    })) as ProviderTurn | null;

    if (
      !turn ||
      turn.status !== TurnStatus.in_progress ||
      turn.currentParticipant?.participantType !== ParticipantType.provider ||
      !turn.currentParticipant.providerName ||
      !turn.currentParticipant.modelName
    ) {
      return null;
    }

    return turn;
  }

  private async generateProviderMessage(
    projectSlug: string,
    topicId: string,
    turn: ProviderTurn,
  ): Promise<ProviderGeneratedMessage> {
    const context = await this.buildContext(projectSlug, topicId, turn);
    const adapter = this.registry.get(turn.currentParticipant.providerName!);
    const result = await adapter.generate({
      ...context,
      modelName: turn.currentParticipant.modelName!,
    });
    const message = this.parseProviderGeneratedMessage(result.content);

    if (!message.content) {
      throw new ProviderCallFailedError(
        turn.currentParticipant.providerName!,
        'empty response',
      );
    }

    return message;
  }

  private async buildContext(
    projectSlug: string,
    topicId: string,
    turn: ProviderTurn,
  ) {
    const [project, topic, participants, documents, previousMessages] =
      await Promise.all([
        this.prisma.project.findUnique({ where: { slug: projectSlug } }),
        this.prisma.topic.findFirst({
          where: { id: topicId, projectId: turn.projectId },
        }),
        this.prisma.participant.findMany({
          where: { projectId: turn.projectId },
          orderBy: { joinOrder: 'asc' },
        }),
        this.prisma.document.findMany({
          where: {
            projectId: turn.projectId,
            OR: [{ topicId }, { topicId: null }],
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.message.findMany({
          where: { topicId },
          orderBy: { createdAt: 'asc' },
          include: {
            participant: {
              select: { anonymousName: true },
            },
          },
        }),
      ]);

    if (!project || !topic) {
      throw new ProviderCallFailedError(
        turn.currentParticipant.providerName!,
        'context source not found',
      );
    }

    const contextInput = toContextBuilderInput({
      project,
      topic,
      participants,
      documents,
      previousMessages,
      caller: turn.currentParticipant,
    });

    const context = await this.contextBuilder.build(contextInput, {
      summaryParticipants: toSummaryParticipants(participants),
    });

    return {
      ...context,
      contextMessages: [
        ...context.contextMessages,
        {
          role: 'user' as const,
          content: [
            '[provider submit format]',
            'Return a JSON object with string fields "content" and "debateSignal".',
            'Use debateSignal "ready_to_finalize" only when the discussion has enough material for the report and you have no unresolved objection that requires another debate turn. Otherwise use "continue".',
          ].join('\n'),
        },
      ],
    };
  }

  private parseProviderGeneratedMessage(rawContent: string): ProviderGeneratedMessage {
    const trimmed = rawContent.trim();
    const jsonCandidate = this.extractJsonObject(trimmed);

    try {
      const parsed = JSON.parse(jsonCandidate) as {
        content?: unknown;
        debateSignal?: unknown;
      };

      if (typeof parsed.content === 'string') {
        return {
          content: parsed.content.trim(),
          debateSignal: isDebateSignalValue(parsed.debateSignal)
            ? parsed.debateSignal
            : 'continue',
        };
      }
    } catch {
      // Existing providers return plain text; keep that path compatible.
    }

    return {
      content: trimmed,
      debateSignal: 'continue',
    };
  }

  private extractJsonObject(content: string): string {
    const fencedJson = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu);

    if (fencedJson?.[1]) {
      return fencedJson[1].trim();
    }

    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return content.slice(firstBrace, lastBrace + 1);
    }

    return content;
  }

  private async skipProviderTurn(
    payload: TurnChangedEvent,
    error: unknown,
  ): Promise<void> {
    const domainEvents: DomainEvent[] = [];

    await this.prisma.$transaction(async (tx) => {
      const turn = await this.lockAndFindTurn(tx, payload.turn.id);

      if (
        !turn ||
        turn.status !== TurnStatus.in_progress ||
        turn.currentParticipant?.participantType !== ParticipantType.provider
      ) {
        return;
      }

      const createdTurns = await this.turnEngine.advanceFromCurrentTurn(
        tx,
        turn,
        TurnStatus.skipped,
      );
      const nextTurn = await this.findNextTurnWithParticipant(tx, createdTurns);
      this.describeAutoSpeakFailure(error);

      if (nextTurn) {
        domainEvents.push({
          type: DOMAIN_EVENT.turnChanged,
          payload: {
            projectId: turn.projectId,
            projectSlug: payload.projectSlug,
            topicId: turn.topicId,
            turn: nextTurn,
          },
        });
      }
    });

    for (const event of domainEvents) {
      this.events.emit(event);
    }
  }

  private async lockAndFindTurn(
    tx: AutoSpeakTransaction,
    turnId: string,
  ): Promise<ProviderTurn | null> {
    await tx.$queryRaw`
      SELECT id FROM turns WHERE id = ${turnId}::uuid FOR UPDATE
    `;

    return this.findTurnWithParticipant(tx, turnId);
  }

  private findTurnWithParticipant(
    tx: AutoSpeakTransaction,
    turnId: string,
  ): Promise<ProviderTurn | null> {
    return tx.turn.findUnique({
      where: { id: turnId },
      include: {
        currentParticipant: true,
      },
    }) as Promise<ProviderTurn | null>;
  }

  private async findNextTurnWithParticipant(
    tx: AutoSpeakTransaction,
    createdTurns: Turn[],
  ): Promise<ProviderTurn | null> {
    const nextTurn = [...createdTurns]
      .reverse()
      .find((turn) => turn.status === TurnStatus.in_progress);

    if (!nextTurn) {
      return null;
    }

    return this.findTurnWithParticipant(tx, nextTurn.id);
  }

  private describeAutoSpeakFailure(error: unknown): string {
    this.logger.warn(`Provider auto-speak failed: ${this.formatLogError(error)}`);
    return 'provider_call_failed';
  }

  private formatLogError(error: unknown): string {
    return maskLogMessage(error instanceof Error ? error.message : String(error));
  }
}

function toContextBuilderInput(input: {
  project: Project;
  topic: Topic;
  participants: Participant[];
  documents: Array<{
    id: string;
    projectId: string;
    topicId: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: bigint;
    contentHash: string;
    createdAt: Date;
  }>;
  previousMessages: Array<{
    id: string;
    topicId: string;
    participant: { anonymousName: string } | null;
    kind: MessageKind;
    phase: Topic['phase'];
    content: string;
    debateSignal: DebateSignal;
    turnIndex: number;
    roundIndex: number;
    createdAt: Date;
  }>;
  caller: Participant;
}): ContextBuilderInput {
  return {
    project: input.project as ProjectAnonymousDto,
    topic: input.topic as TopicAnonymousDto,
    currentSpeaker: { anonymousName: input.caller.anonymousName },
    caller: { anonymousName: input.caller.anonymousName },
    participants: input.participants.map((participant) => ({
      anonymousName: participant.anonymousName,
      participantType: participant.participantType,
      status: participant.status,
      joinOrder: participant.joinOrder,
    })),
    documents: input.documents.map((document) => ({
      id: document.id,
      projectId: document.projectId,
      topicId: document.topicId,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      contentHash: document.contentHash,
      createdAt: document.createdAt,
      content: '',
    })) as ContextBuilderInput['documents'],
    previousMessages: input.previousMessages.map((message) => ({
      id: message.id,
      topicId: message.topicId,
      participant: message.participant,
      kind: message.kind,
      phase: message.phase,
      content: message.content,
      debateSignal: fromPrismaDebateSignal(message.debateSignal),
      turnIndex: message.turnIndex,
      roundIndex: message.roundIndex,
      createdAt: message.createdAt,
    })) as MessageAnonymousDto[],
    reporterMember: null,
  } as ContextBuilderInput;
}

function toSummaryParticipants(
  participants: Participant[],
): SummaryParticipant[] {
  return participants.map((participant) => ({
    anonymousName: participant.anonymousName,
    participantType: participant.participantType,
    status: participant.status,
    joinOrder: participant.joinOrder,
    providerName: participant.providerName ?? undefined,
    modelName: participant.modelName ?? undefined,
  }));
}
