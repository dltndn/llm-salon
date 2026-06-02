import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ParticipantType,
  Prisma,
  ReportStatus,
  Topic,
  TopicPhase,
} from '@prisma/client';

import { Audience } from '../common/audience';
import {
  ParticipantConflictError,
  PhaseTransitionError,
  ReportAlreadyExistsError,
  WrongTurnError,
} from '../common/errors/domain.errors';
import { DOMAIN_EVENT, DomainEvent } from '../events/domain-events';
import { DomainEventBus } from '../events/event-bus';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { SubmitReportArtifactDto } from './dto/submit-report-artifact.dto';
import { selectReporterParticipantId } from './reporter-selector';

export type ReportStatusResponse = {
  status: ReportStatus;
  draftAvailable: boolean;
  finalAvailable: boolean;
  filePath?: string;
  draftPreview?: string;
  /** Pending app final artifact while finalizing without a saved file yet. */
  finalContent?: string;
};

type PreparedAppFinalSubmission = {
  reportId: string;
  projectId: string;
  topicId: string;
  content: string;
};

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
    private readonly storage: LocalStorageService,
  ) {}

  async getReportStatus(
    projectSlug: string,
    topicId: string,
    audience: Audience = 'human',
  ): Promise<ReportStatusResponse> {
    const project = await this.prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectSlug}`);
    }

    const topic = await this.prisma.topic.findFirst({
      where: { id: topicId, projectId: project.id },
      select: { id: true },
    });

    if (!topic) {
      throw new NotFoundException(`Topic not found: ${topicId}`);
    }

    const report = await this.prisma.report.findFirst({
      where: { projectId: project.id, topicId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!report) {
      return {
        status: ReportStatus.none,
        draftAvailable: false,
        finalAvailable: false,
      };
    }

    const response: ReportStatusResponse = {
      status: report.status,
      draftAvailable: report.draftContent !== null,
      finalAvailable: report.finalContent !== null,
    };

    if (audience === 'human') {
      return {
        ...response,
        ...(report.filePath ? { filePath: report.filePath } : {}),
        ...(report.draftContent
          ? { draftPreview: report.draftContent.slice(0, 500) }
          : {}),
      };
    }

    return {
      ...response,
      ...this.pendingFinalContentFields(report),
    };
  }

  private pendingFinalContentFields(report: {
    status: ReportStatus;
    finalContent: string | null;
    filePath: string | null;
  }): Pick<ReportStatusResponse, 'finalContent'> {
    if (
      report.status !== ReportStatus.finalizing ||
      report.finalContent === null ||
      report.filePath !== null
    ) {
      return {};
    }

    return { finalContent: report.finalContent };
  }

  /**
   * Enters drafting and queues draft generation for Task 6.2.
   * Queue contract: one report row per topic with `status=drafting` and null
   * `draft_content`. Task 6.2 consumes the returned report id, generates the
   * draft, then emits `report.draft_created` when content is saved.
   */
  async beginDrafting(
    tx: Prisma.TransactionClient,
    params: {
      projectId: string;
      projectSlug: string;
      topic: Topic;
      domainEvents: DomainEvent[];
      currentTurnHolderParticipantId?: string | null;
    },
  ): Promise<string> {
    const {
      projectId,
      projectSlug,
      topic,
      domainEvents,
      currentTurnHolderParticipantId,
    } = params;

    if (topic.phase !== TopicPhase.debating) {
      throw new PhaseTransitionError(topic.phase, TopicPhase.drafting);
    }

    const participants = await tx.participant.findMany({
      where: { projectId },
      select: {
        id: true,
        joinOrder: true,
        participantType: true,
        status: true,
      },
    });
    const reporterParticipantId = selectReporterParticipantId(
      participants,
      currentTurnHolderParticipantId,
    );

    if (!reporterParticipantId) {
      throw new PhaseTransitionError(topic.phase, TopicPhase.drafting);
    }

    const existingReports = await tx.report.findMany({
      where: { projectId, topicId: topic.id },
      take: 2,
      select: {
        id: true,
        status: true,
        draftContent: true,
        finalContent: true,
      },
    });
    const reportAction = this.resolveDraftingReportAction(
      existingReports,
      topic.id,
    );

    await tx.topic.update({
      where: { id: topic.id },
      data: {
        phase: TopicPhase.drafting,
        reporterParticipantId,
        version: { increment: 1 },
      },
    });

    const report =
      reportAction === 'create'
        ? await tx.report.create({
            data: {
              projectId,
              topicId: topic.id,
              reporterParticipantId,
              status: ReportStatus.drafting,
            },
          })
        : await tx.report.update({
            where: { id: reportAction },
            data: {
              reporterParticipantId,
              status: ReportStatus.drafting,
            },
          });

    domainEvents.push({
      type: DOMAIN_EVENT.topicPhaseChanged,
      payload: {
        projectId,
        projectSlug,
        topicId: topic.id,
        phase: TopicPhase.drafting,
      },
    });

    return report.id;
  }

  async submitReportDraft(
    projectSlug: string,
    topicId: string,
    dto: SubmitReportArtifactDto,
  ): Promise<{ reportId: string; phaseAfter: TopicPhase }> {
    const domainEvents: DomainEvent[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const { project, topic } = await this.findTopicForMutation(
        tx,
        projectSlug,
        topicId,
      );

      if (topic.phase !== TopicPhase.drafting) {
        throw new PhaseTransitionError(topic.phase, TopicPhase.reviewing);
      }

      const reporter = await this.requireAppReporter(tx, topic, dto.participantId);
      const reports = await tx.report.findMany({
        where: { projectId: project.id, topicId: topic.id },
        take: 2,
        select: {
          id: true,
          reporterParticipantId: true,
          status: true,
          draftContent: true,
          finalContent: true,
        },
      });
      this.assertSingleReportRow(reports, topic.id);

      const report = reports[0];
      if (
        !report ||
        report.reporterParticipantId !== reporter.id ||
        report.status !== ReportStatus.drafting ||
        report.draftContent !== null
      ) {
        if (report?.draftContent !== null) {
          throw new ParticipantConflictError(
            'Report draft has already been submitted for this topic.',
          );
        }

        throw new WrongTurnError(reporter.anonymousName);
      }

      const claimed = await tx.report.updateMany({
        where: {
          id: report.id,
          status: ReportStatus.drafting,
          draftContent: null,
        },
        data: {
          draftContent: dto.content,
          status: ReportStatus.draft_ready,
        },
      });

      if (claimed.count !== 1) {
        throw new ParticipantConflictError(
          'Report draft has already been submitted for this topic.',
        );
      }
      await tx.topic.update({
        where: { id: topic.id, phase: TopicPhase.drafting },
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
            projectId: project.id,
            projectSlug,
            topicId: topic.id,
            reportId: report.id,
          },
        },
        {
          type: DOMAIN_EVENT.topicPhaseChanged,
          payload: {
            projectId: project.id,
            projectSlug,
            topicId: topic.id,
            phase: TopicPhase.reviewing,
          },
        },
      );

      return { reportId: report.id, phaseAfter: TopicPhase.reviewing };
    });

    for (const event of domainEvents) {
      this.events.emit(event);
    }

    return result;
  }

  async submitReportFinal(
    projectSlug: string,
    topicId: string,
    dto: SubmitReportArtifactDto,
  ): Promise<{ reportId: string; phaseAfter: TopicPhase; filePath: string }> {
    const domainEvents: DomainEvent[] = [];
    const prepared = await this.prisma.$transaction((tx) =>
      this.prepareAppFinalSubmission(tx, projectSlug, topicId, dto),
    );

    let filePath: string | undefined;
    try {
      filePath = await this.storage.writeReportMarkdown(
        projectSlug,
        topicId,
        prepared.content,
      );

      await this.prisma.$transaction((tx) =>
        this.completeAppFinalSubmission(tx, prepared, filePath!),
      );
    } catch (error) {
      if (filePath) {
        await this.cleanupFailedFinalFile(filePath, prepared.reportId);
      }

      throw error;
    }

    domainEvents.push(
      {
        type: DOMAIN_EVENT.reportCreated,
        payload: {
          projectId: prepared.projectId,
          projectSlug,
          topicId: prepared.topicId,
          report: {
            id: prepared.reportId,
            filePath: filePath!,
          },
        },
      },
      {
        type: DOMAIN_EVENT.topicPhaseChanged,
        payload: {
          projectId: prepared.projectId,
          projectSlug,
          topicId: prepared.topicId,
          phase: TopicPhase.finalized,
        },
      },
    );

    for (const event of domainEvents) {
      this.events.emit(event);
    }

    return {
      reportId: prepared.reportId,
      phaseAfter: TopicPhase.finalized,
      filePath: filePath!,
    };
  }

  private async prepareAppFinalSubmission(
    tx: Prisma.TransactionClient,
    projectSlug: string,
    topicId: string,
    dto: SubmitReportArtifactDto,
  ): Promise<PreparedAppFinalSubmission> {
    const { project, topic } = await this.findTopicForMutation(
      tx,
      projectSlug,
      topicId,
    );

    if (topic.phase === TopicPhase.finalized) {
      throw new ParticipantConflictError(
        'Final report has already been submitted for this topic.',
      );
    }

    if (topic.phase !== TopicPhase.finalizing) {
      throw new PhaseTransitionError(topic.phase, TopicPhase.finalized);
    }

    const reporter = await this.requireAppReporter(tx, topic, dto.participantId);
    const reports = await tx.report.findMany({
      where: { projectId: project.id, topicId: topic.id },
      take: 2,
      select: {
        id: true,
        reporterParticipantId: true,
        status: true,
        draftContent: true,
        finalContent: true,
        filePath: true,
      },
    });
    this.assertSingleReportRow(reports, topic.id);

    const report = reports[0];
    if (!report || report.reporterParticipantId !== reporter.id) {
      throw new WrongTurnError(reporter.anonymousName);
    }

    if (
      report.status === ReportStatus.finalized ||
      report.filePath !== null
    ) {
      throw new ParticipantConflictError(
        'Final report has already been submitted for this topic.',
      );
    }

    if (report.status !== ReportStatus.finalizing) {
      throw new WrongTurnError(reporter.anonymousName);
    }

    if (report.finalContent !== null && report.filePath === null) {
      return {
        reportId: report.id,
        projectId: project.id,
        topicId: topic.id,
        content: report.finalContent,
      };
    }

    if (report.finalContent !== null) {
      throw new ParticipantConflictError(
        'Final report has already been submitted for this topic.',
      );
    }

    const claimed = await tx.report.updateMany({
      where: {
        id: report.id,
        status: ReportStatus.finalizing,
        finalContent: null,
        filePath: null,
      },
      data: {
        finalContent: dto.content,
      },
    });

    if (claimed.count === 1) {
      return {
        reportId: report.id,
        projectId: project.id,
        topicId: topic.id,
        content: dto.content,
      };
    }

    const resumed = await tx.report.findFirst({
      where: {
        id: report.id,
        status: ReportStatus.finalizing,
        filePath: null,
        NOT: { finalContent: null },
      },
      select: { finalContent: true },
    });

    if (resumed?.finalContent) {
      return {
        reportId: report.id,
        projectId: project.id,
        topicId: topic.id,
        content: resumed.finalContent,
      };
    }

    throw new ParticipantConflictError(
      'Final report has already been submitted for this topic.',
    );
  }

  private async completeAppFinalSubmission(
    tx: Prisma.TransactionClient,
    prepared: PreparedAppFinalSubmission,
    filePath: string,
  ): Promise<void> {
    const finalized = await tx.report.updateMany({
      where: {
        id: prepared.reportId,
        status: ReportStatus.finalizing,
        finalContent: prepared.content,
        filePath: null,
      },
      data: {
        filePath,
        status: ReportStatus.finalized,
      },
    });

    if (finalized.count !== 1) {
      throw new ParticipantConflictError(
        'Final report has already been submitted for this topic.',
      );
    }

    const topicUpdated = await tx.topic.updateMany({
      where: { id: prepared.topicId, phase: TopicPhase.finalizing },
      data: {
        phase: TopicPhase.finalized,
        version: { increment: 1 },
      },
    });

    if (topicUpdated.count !== 1) {
      throw new PhaseTransitionError(
        TopicPhase.finalizing,
        TopicPhase.finalized,
      );
    }
  }

  private async cleanupFailedFinalFile(
    filePath: string,
    reportId: string,
  ): Promise<void> {
    try {
      await this.storage.deleteReportFile(filePath);
    } catch (error) {
      this.logger.warn(
        `Failed to delete incomplete final report file for report ${reportId}: ${filePath}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async findTopicForMutation(
    tx: Prisma.TransactionClient,
    projectSlug: string,
    topicId: string,
  ) {
    const project = await tx.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true, slug: true },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectSlug}`);
    }

    const topic = await tx.topic.findFirst({
      where: { id: topicId, projectId: project.id },
    });

    if (!topic) {
      throw new NotFoundException(`Topic not found: ${topicId}`);
    }

    return { project, topic };
  }

  private async requireAppReporter(
    tx: Prisma.TransactionClient,
    topic: Topic,
    participantId: string,
  ) {
    const reporter = await tx.participant.findFirst({
      where: {
        id: participantId,
        projectId: topic.projectId,
      },
      select: {
        id: true,
        anonymousName: true,
        participantType: true,
      },
    });

    if (
      !reporter ||
      reporter.id !== topic.reporterParticipantId ||
      reporter.participantType !== ParticipantType.app
    ) {
      const assignedReporter = topic.reporterParticipantId
        ? await tx.participant.findFirst({
            where: { id: topic.reporterParticipantId },
            select: { anonymousName: true },
          })
        : null;

      throw new WrongTurnError(assignedReporter?.anonymousName ?? null);
    }

    return reporter;
  }

  private assertSingleReportRow(
    reports: Array<{ id: string }>,
    topicId: string,
  ): void {
    if (reports.length > 1) {
      throw new ReportAlreadyExistsError(topicId);
    }
  }

  private resolveDraftingReportAction(
    existingReports: Array<{
      id: string;
      status: ReportStatus;
      draftContent: string | null;
      finalContent: string | null;
    }>,
    topicId: string,
  ): 'create' | string {
    if (existingReports.length > 1) {
      throw new ReportAlreadyExistsError(topicId);
    }

    if (existingReports.length === 1) {
      const existingReport = existingReports[0];
      if (!this.canResumeDraftingEntry(existingReport)) {
        throw new ReportAlreadyExistsError(topicId);
      }

      return existingReport.id;
    }

    return 'create';
  }

  private canResumeDraftingEntry(report: {
    status: ReportStatus;
    draftContent: string | null;
    finalContent: string | null;
  }): boolean {
    if (report.finalContent !== null || report.draftContent !== null) {
      return false;
    }

    return (
      report.status === ReportStatus.none ||
      report.status === ReportStatus.drafting
    );
  }
}
