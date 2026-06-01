import { Injectable, NotFoundException } from '@nestjs/common';
import { ParticipantStatus, TurnStatus } from '@prisma/client';

import { Audience } from '../common/audience';
import { fromPrismaDebateSignal } from '../common/debate-signal';
import type {
  DocumentAnonymousDto,
  MessageAnonymousDto,
  ProjectAnonymousDto,
  TopicAnonymousDto,
} from '../common/dto';
import { PrismaService } from '../prisma/prisma.service';
import { serializeTopic } from '../topics/topic.presenter';
import { DocumentsService } from '../documents/documents.service';
import { ContextBuilderService } from './context-builder.service';
import type { ContextBuilderInput } from './context-builder.service';

@Injectable()
export class ContextPayloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly contextBuilder: ContextBuilderService,
  ) {}

  async getContext(
    projectSlug: string,
    topicId: string,
    _audience: Audience = 'human',
  ) {
    void _audience;

    const project = await this.prisma.project.findUnique({
      where: { slug: projectSlug },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectSlug}`);
    }

    const [topic, participants, documents, messages, turn] = await Promise.all([
      this.prisma.topic.findFirst({
        where: { id: topicId, projectId: project.id },
      }),
      this.prisma.participant.findMany({
        where: { projectId: project.id },
        orderBy: { joinOrder: 'asc' },
      }),
      this.prisma.document.findMany({
        where: { projectId: project.id, OR: [{ topicId }, { topicId: null }] },
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
            select: { anonymousName: true },
          },
        },
      }),
    ]);

    if (!topic) {
      throw new NotFoundException(`Topic not found: ${topicId}`);
    }

    const caller =
      turn?.currentParticipant ??
      participants.find(
        (participant) =>
          participant.status === ParticipantStatus.active ||
          participant.status === ParticipantStatus.waiting,
      );

    if (!caller) {
      throw new NotFoundException('No participant is available for context.');
    }

    return this.contextBuilder.build(
      ({
        project: {
          ...project,
          topics: undefined,
          participants: undefined,
        } as ProjectAnonymousDto,
        topic: serializeTopic(topic, 'anonymous') as TopicAnonymousDto,
        currentSpeaker: { anonymousName: caller.anonymousName },
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
              content: await this.documents.readDocumentContent(
                document.filePath,
              ),
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
        reporterMember: null,
      }) as ContextBuilderInput,
      {
        summaryParticipants: participants.map((participant) => ({
          anonymousName: participant.anonymousName,
          participantType: participant.participantType,
          providerName: participant.providerName ?? undefined,
          modelName: participant.modelName ?? undefined,
          status: participant.status,
          joinOrder: participant.joinOrder,
        })),
      },
    );
  }
}
