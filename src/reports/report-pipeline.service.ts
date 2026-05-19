import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Message,
  MessageKind,
  Participant,
  ParticipantType,
  ReportStatus,
  Topic,
  TopicPhase,
} from '@prisma/client';

import type { LlmSalonOutputLanguage } from '../config/env.schema';
import { DEFAULT_LLM_SALON_OUTPUT_LANGUAGE } from '../config/env.schema';
import { DocumentsService } from '../documents/documents.service';
import {
  DOMAIN_EVENT,
  DomainEvent,
  TopicPhaseChangedEvent,
} from '../events/domain-events';
import { DomainEventBus } from '../events/event-bus';
import { LlmProviderRegistry } from '../llm/llm-provider.registry';
import type { LlmContextMessage } from '../llm/llm-adapter.interface';
import { ProviderCallFailedError } from '../llm/llm.errors';
import {
  buildReportStageInstruction,
  buildReportSystemPromptWithOutputLanguage,
  type ReportPromptStage,
} from '../prompt/report-prompts';
import { assertNoHumanIdentifierText } from '../prompt/prompt-input';
import { PrismaService } from '../prisma/prisma.service';

type ReportPipelineJob = {
  projectId: string;
  projectSlug: string;
  topicId: string;
  reportId: string;
  outputLanguage: LlmSalonOutputLanguage;
  reporter: Participant;
  topic: Topic;
  draftContent: string | null;
  feedbackMessages: Message[];
  debateMessages: Array<
    Message & { participant: { anonymousName: string } | null }
  >;
  documents: Array<{ fileName: string; mimeType: string; content: string }>;
  participants: Participant[];
};

@Injectable()
export class ReportPipelineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportPipelineService.name);
  private readonly inFlightTopics = new Set<string>();
  private unsubscribeFromPhaseChanged: (() => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
    private readonly registry: LlmProviderRegistry,
    private readonly documents: DocumentsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.unsubscribeFromPhaseChanged = this.events.on(
      DOMAIN_EVENT.topicPhaseChanged,
      (payload) => {
        if (payload.phase === TopicPhase.drafting) {
          void this.runExclusive(payload, 'draft', () =>
            this.runDraftPhase(payload),
          );
        } else if (payload.phase === TopicPhase.finalizing) {
          void this.runExclusive(payload, 'finalize', () =>
            this.runFinalizePhase(payload),
          );
        }
      },
    );
  }

  onModuleDestroy(): void {
    this.unsubscribeFromPhaseChanged?.();
  }

  private topicKey(projectId: string, topicId: string): string {
    return `${projectId}:${topicId}`;
  }

  private async runDraftPhase(payload: TopicPhaseChangedEvent): Promise<void> {
    const job = await this.loadJob(payload, {
      topicPhase: TopicPhase.drafting,
      reportStatus: ReportStatus.drafting,
      requireEmptyDraft: true,
    });

    if (!job) {
      return;
    }

    let draftContent: string;
    try {
      draftContent = await this.generateReportContent(job, 'drafting', [
        ...this.buildDebateContextBlocks(job),
      ]);
    } catch (error) {
      this.logPipelineFailure('draft', payload, error);
      return;
    }

    const domainEvents: DomainEvent[] = [];
    await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.findFirst({
        where: {
          id: job.reportId,
          status: ReportStatus.drafting,
          draftContent: null,
        },
      });

      if (!report) {
        return;
      }

      await tx.report.update({
        where: { id: report.id },
        data: {
          draftContent,
          status: ReportStatus.draft_ready,
        },
      });
      await tx.topic.update({
        where: { id: payload.topicId, phase: TopicPhase.drafting },
        data: {
          phase: TopicPhase.reviewing,
          version: { increment: 1 },
        },
      });
      await tx.report.update({
        where: { id: report.id },
        data: { status: ReportStatus.reviewing },
      });

      domainEvents.push(
        {
          type: DOMAIN_EVENT.reportDraftCreated,
          payload: {
            projectId: payload.projectId,
            projectSlug: payload.projectSlug,
            topicId: payload.topicId,
            reportId: report.id,
          },
        },
        {
          type: DOMAIN_EVENT.topicPhaseChanged,
          payload: {
            ...payload,
            phase: TopicPhase.reviewing,
          },
        },
      );
    });

    this.emitEvents(domainEvents);
  }

  private async runFinalizePhase(
    payload: TopicPhaseChangedEvent,
  ): Promise<void> {
    const job = await this.loadJob(payload, {
      topicPhase: TopicPhase.finalizing,
      reportStatus: ReportStatus.finalizing,
      requireDraft: true,
    });

    if (!job || !job.draftContent) {
      return;
    }

    let revisionNotes: string;
    let finalContent: string;
    try {
      revisionNotes = await this.generateReportContent(job, 'reviewing', [
        this.buildDraftBlock(job.draftContent),
        this.buildFeedbackBlock(job.feedbackMessages, job.participants),
      ]);
      finalContent = await this.generateReportContent(job, 'finalizing', [
        this.buildDraftBlock(job.draftContent),
        `[revision notes]\n${revisionNotes}`,
        this.buildFeedbackBlock(job.feedbackMessages, job.participants),
      ]);
    } catch (error) {
      this.logPipelineFailure('finalize', payload, error);
      return;
    }

    const filePath = await this.writeFinalReportFile(
      payload.projectSlug,
      payload.topicId,
      finalContent,
    );

    const domainEvents: DomainEvent[] = [];
    await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.findFirst({
        where: {
          id: job.reportId,
          status: ReportStatus.finalizing,
        },
      });

      if (!report) {
        return;
      }

      await tx.report.update({
        where: { id: report.id },
        data: {
          finalContent,
          filePath,
          status: ReportStatus.finalized,
        },
      });
      await tx.topic.update({
        where: { id: payload.topicId, phase: TopicPhase.finalizing },
        data: {
          phase: TopicPhase.finalized,
          version: { increment: 1 },
        },
      });

      domainEvents.push(
        {
          type: DOMAIN_EVENT.reportCreated,
          payload: {
            projectId: payload.projectId,
            projectSlug: payload.projectSlug,
            topicId: payload.topicId,
            report: {
              id: report.id,
              filePath,
            },
          },
        },
        {
          type: DOMAIN_EVENT.topicPhaseChanged,
          payload: {
            ...payload,
            phase: TopicPhase.finalized,
          },
        },
      );
    });

    this.emitEvents(domainEvents);
  }

  private async runExclusive(
    payload: TopicPhaseChangedEvent,
    stage: 'draft' | 'finalize',
    work: () => Promise<void>,
  ): Promise<void> {
    const key = this.topicKey(payload.projectId, payload.topicId);

    if (this.inFlightTopics.has(key)) {
      return;
    }

    this.inFlightTopics.add(key);
    try {
      await work();
    } catch (error) {
      this.logPipelineFailure(stage, payload, error);
    } finally {
      this.inFlightTopics.delete(key);
    }
  }

  private async loadJob(
    payload: TopicPhaseChangedEvent,
    criteria: {
      topicPhase: TopicPhase;
      reportStatus: ReportStatus;
      requireEmptyDraft?: boolean;
      requireDraft?: boolean;
    },
  ): Promise<ReportPipelineJob | null> {
    const [project, topic, report, participants, messages, documents] =
      await Promise.all([
        this.prisma.project.findUnique({
          where: { id: payload.projectId },
          select: { id: true, slug: true },
        }),
        this.prisma.topic.findFirst({
          where: { id: payload.topicId, projectId: payload.projectId },
        }),
        this.prisma.report.findFirst({
          where: {
            projectId: payload.projectId,
            topicId: payload.topicId,
            status: criteria.reportStatus,
          },
        }),
        this.prisma.participant.findMany({
          where: { projectId: payload.projectId },
          orderBy: { joinOrder: 'asc' },
        }),
        this.prisma.message.findMany({
          where: { topicId: payload.topicId },
          orderBy: { createdAt: 'asc' },
          include: {
            participant: {
              select: { anonymousName: true },
            },
          },
        }),
        this.prisma.document.findMany({
          where: {
            projectId: payload.projectId,
            OR: [{ topicId: payload.topicId }, { topicId: null }],
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    if (!project || !topic || topic.phase !== criteria.topicPhase || !report) {
      return null;
    }

    if (criteria.requireEmptyDraft && report.draftContent !== null) {
      return null;
    }

    if (criteria.requireDraft && !report.draftContent) {
      return null;
    }

    const reporter = participants.find(
      (participant) => participant.id === report.reporterParticipantId,
    );

    if (
      !reporter ||
      reporter.participantType !== ParticipantType.provider ||
      !reporter.providerName ||
      !reporter.modelName
    ) {
      return null;
    }

    const loadedDocuments = await Promise.all(
      documents.map(async (document) => ({
        fileName: document.fileName,
        mimeType: document.mimeType,
        content: await this.documents.readDocumentContent(document.filePath),
      })),
    );

    const debateMessages = messages.filter(
      (message) => message.kind === MessageKind.statement,
    );
    const feedbackMessages = messages.filter(
      (message) => message.kind === MessageKind.feedback,
    );

    return {
      projectId: payload.projectId,
      projectSlug: payload.projectSlug,
      topicId: payload.topicId,
      reportId: report.id,
      outputLanguage: this.resolveOutputLanguage(),
      reporter,
      topic,
      draftContent: report.draftContent,
      feedbackMessages,
      debateMessages,
      documents: loadedDocuments,
      participants,
    };
  }

  private resolveOutputLanguage(): LlmSalonOutputLanguage {
    return (this.config.get<string>('LLM_SALON_OUTPUT_LANGUAGE') ??
      DEFAULT_LLM_SALON_OUTPUT_LANGUAGE) as LlmSalonOutputLanguage;
  }

  private buildDebateContextBlocks(job: ReportPipelineJob): string[] {
    return [
      this.buildTopicBlock(job.topic),
      this.buildDocumentsBlock(job.documents),
      this.buildParticipantsBlock(job.participants),
      this.buildDebateMessagesBlock(job.debateMessages),
    ];
  }

  private async generateReportContent(
    job: ReportPipelineJob,
    stage: ReportPromptStage,
    userBlocks: string[],
  ): Promise<string> {
    const systemPrompt = buildReportSystemPromptWithOutputLanguage(
      stage,
      job.reporter.anonymousName,
      job.outputLanguage,
    );
    const contextMessages: LlmContextMessage[] = [
      { role: 'system', content: this.buildReportStateBlock(job) },
      ...userBlocks.map((content) => ({ role: 'user' as const, content })),
      { role: 'user', content: buildReportStageInstruction(stage) },
      { role: 'assistant', content: '' },
    ];
    const payload = { systemPrompt, contextMessages };
    assertNoHumanIdentifierText(payload);

    const adapter = this.registry.get(job.reporter.providerName!);
    const result = await adapter.generate({
      ...payload,
      modelName: job.reporter.modelName!,
    });
    const content = result.content.trim();

    if (!content) {
      throw new ProviderCallFailedError(
        job.reporter.providerName!,
        'empty response',
      );
    }

    return content;
  }

  private buildReportStateBlock(job: ReportPipelineJob): string {
    return [
      '[system status]',
      `project: ${job.projectSlug}`,
      `phase: ${job.topic.phase}`,
      `mode: ${job.topic.mode}`,
      `reporter_member: ${job.reporter.anonymousName}`,
    ].join('\n');
  }

  private buildTopicBlock(topic: Topic): string {
    return [
      '[topic]',
      `title: ${topic.title}`,
      `description: ${topic.description ?? ''}`,
    ].join('\n');
  }

  private buildDocumentsBlock(
    documents: Array<{ fileName: string; mimeType: string; content: string }>,
  ): string {
    if (documents.length === 0) {
      return '[documents]\n(none)';
    }

    return documents
      .map((document) =>
        [
          '[document]',
          `file_name: ${document.fileName}`,
          `mime_type: ${document.mimeType}`,
          document.content,
        ].join('\n'),
      )
      .join('\n\n');
  }

  private buildParticipantsBlock(participants: Participant[]): string {
    return [
      '[participants]',
      ...participants.map(
        (participant) =>
          `${participant.joinOrder}. ${participant.anonymousName} (${participant.status})`,
      ),
    ].join('\n');
  }

  private buildDebateMessagesBlock(
    messages: Array<
      Message & { participant: { anonymousName: string } | null }
    >,
  ): string {
    if (messages.length === 0) {
      return '[debate messages]\n(none)';
    }

    return [
      '[debate messages]',
      ...messages.map(
        (message) =>
          `${message.participant?.anonymousName ?? 'Unknown member'}: ${message.content}`,
      ),
    ].join('\n');
  }

  private buildDraftBlock(draftContent: string): string {
    return `[draft report]\n${draftContent}`;
  }

  private buildFeedbackBlock(
    messages: Message[],
    participants: Participant[],
  ): string {
    if (messages.length === 0) {
      return '[member feedback]\n(none)';
    }

    const names = new Map(
      participants.map((participant) => [
        participant.id,
        participant.anonymousName,
      ]),
    );

    return [
      '[member feedback]',
      ...messages.map(
        (message) =>
          `${names.get(message.participantId) ?? 'Unknown member'}: ${message.content}`,
      ),
    ].join('\n');
  }

  private async writeFinalReportFile(
    projectSlug: string,
    topicId: string,
    content: string,
  ): Promise<string> {
    const home = this.config.get<string>(
      'LLM_SALON_HOME',
      process.env.LLM_SALON_HOME ?? '.',
    );
    const directory = join(home, 'projects', projectSlug, 'reports');
    await mkdir(directory, { recursive: true });
    const filePath = join(directory, `${topicId}-${Date.now()}.md`);
    await writeFile(filePath, content, 'utf8');

    return filePath;
  }

  private emitEvents(domainEvents: DomainEvent[]): void {
    for (const event of domainEvents) {
      this.events.emit(event);
    }
  }

  private logPipelineFailure(
    stage: string,
    payload: TopicPhaseChangedEvent,
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Report pipeline ${stage} failed for topic ${payload.topicId}: ${message}`,
    );
  }
}
