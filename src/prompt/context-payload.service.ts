import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TurnStatus } from '@prisma/client';

import {
  participantHasFeedback,
  resolveCallerAction,
} from '../actions/action-resolver';
import { Audience } from '../common/audience';
import { fromPrismaDebateSignal } from '../common/debate-signal';
import type {
  DocumentAnonymousDto,
  MessageAnonymousDto,
  ProjectAnonymousDto,
  TopicAnonymousDto,
} from '../common/dto';
import {
  DEFAULT_LLM_SALON_OUTPUT_LANGUAGE,
  type LlmSalonOutputLanguage,
} from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { serializeTopic } from '../topics/topic.presenter';
import { DocumentsService } from '../documents/documents.service';
import {
  ContextBuilderService,
  type ContextTaskAction,
} from './context-builder.service';
import type { ContextBuilderInput } from './context-builder.service';

@Injectable()
export class ContextPayloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly config: ConfigService,
  ) {}

  async getContext(
    projectSlug: string,
    topicId: string,
    participantId: string | undefined,
    _audience: Audience = 'human',
  ) {
    void _audience;

    if (!participantId?.trim()) {
      throw new BadRequestException('participantId is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { slug: projectSlug },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectSlug}`);
    }

    const [topic, participants, documents, messages, turn, report] =
      await Promise.all([
        this.prisma.topic.findFirst({
          where: { id: topicId, projectId: project.id },
        }),
        this.prisma.participant.findMany({
          where: { projectId: project.id },
          orderBy: { joinOrder: 'asc' },
        }),
        this.prisma.document.findMany({
          where: {
            projectId: project.id,
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
        this.prisma.turn.findFirst({
          where: { topicId, status: TurnStatus.in_progress },
          orderBy: { turnIndex: 'desc' },
          include: {
            currentParticipant: {
              select: { id: true, anonymousName: true },
            },
          },
        }),
        this.prisma.report.findFirst({
          where: { projectId: project.id, topicId },
          orderBy: { updatedAt: 'desc' },
        }),
      ]);

    if (!topic) {
      throw new NotFoundException(`Topic not found: ${topicId}`);
    }

    const caller = participants.find(
      (participant) => participant.id === participantId,
    );

    if (!caller) {
      throw new NotFoundException(`Participant not found: ${participantId}`);
    }

    const reporter = topic.reporterParticipantId
      ? participants.find(
          (participant) => participant.id === topic.reporterParticipantId,
        )
      : null;
    const hasFeedback = await participantHasFeedback(
      this.prisma,
      topic.id,
      caller.id,
    );
    const resolved = await resolveCallerAction({
      topic,
      participant: caller,
      turn,
      reporter: reporter
        ? {
            id: reporter.id,
            anonymousName: reporter.anonymousName,
            participantType: reporter.participantType,
          }
        : null,
      hasFeedback,
    });

    if (!resolved.isActionable || resolved.action === 'none') {
      throw new BadRequestException(
        'No actionable task is available for this participant.',
      );
    }

    const taskAction = resolved.action as ContextTaskAction;
    const currentSpeaker = turn?.currentParticipant ?? {
      anonymousName: caller.anonymousName,
    };

    const builderInput = {
      project: {
        ...project,
        topics: undefined,
        participants: undefined,
      } as ProjectAnonymousDto,
      topic: serializeTopic(topic, 'anonymous') as TopicAnonymousDto,
      currentSpeaker: { anonymousName: currentSpeaker.anonymousName },
      caller: { anonymousName: caller.anonymousName },
      participants: participants.map((participant) => ({
        anonymousName: participant.anonymousName,
        participantType: participant.participantType,
        status: participant.status,
        joinOrder: participant.joinOrder,
      })),
      documents: await Promise.all(
        documents.map(async (document) => {
          const anonymousDocument = {
            id: document.id,
            projectId: document.projectId,
            topicId: document.topicId,
            fileName: document.fileName,
            mimeType: document.mimeType,
            sizeBytes: document.sizeBytes,
            contentHash: document.contentHash,
            createdAt: document.createdAt,
            content: await this.documents.readDocumentContent(document.filePath),
          };

          return anonymousDocument as DocumentAnonymousDto & {
            content: string;
          };
        }),
      ),
      previousMessages: messages.map(
        (message) =>
          ({
            id: message.id,
            topicId: message.topicId,
            participant: message.participant
              ? { anonymousName: message.participant.anonymousName }
              : null,
            kind: message.kind,
            phase: message.phase,
            content: message.content,
            debateSignal: fromPrismaDebateSignal(message.debateSignal),
            turnIndex: message.turnIndex,
            roundIndex: message.roundIndex,
            createdAt: message.createdAt,
          }) as MessageAnonymousDto,
      ),
      reporterMember: reporter
        ? { anonymousName: reporter.anonymousName }
        : null,
      taskAction,
      draftContent: report?.draftContent ?? null,
      outputLanguage: this.resolveOutputLanguage(),
    } as ContextBuilderInput;

    return this.contextBuilder.build(builderInput, {
      summaryParticipants: participants.map((participant) => ({
        anonymousName: participant.anonymousName,
        participantType: participant.participantType,
        providerName: participant.providerName ?? undefined,
        modelName: participant.modelName ?? undefined,
        status: participant.status,
        joinOrder: participant.joinOrder,
      })),
    });
  }

  private resolveOutputLanguage(): LlmSalonOutputLanguage {
    return (this.config.get<string>('LLM_SALON_OUTPUT_LANGUAGE') ??
      DEFAULT_LLM_SALON_OUTPUT_LANGUAGE) as LlmSalonOutputLanguage;
  }
}
