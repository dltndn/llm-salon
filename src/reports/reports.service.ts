import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ReportStatus,
  Topic,
  TopicPhase,
} from '@prisma/client';

import { Audience } from '../common/audience';
import {
  PhaseTransitionError,
  ReportAlreadyExistsError,
} from '../common/errors/domain.errors';
import { DOMAIN_EVENT, DomainEvent } from '../events/domain-events';
import { PrismaService } from '../prisma/prisma.service';
import { selectReporterParticipantId } from './reporter-selector';

export type ReportStatusResponse = {
  status: ReportStatus;
  draftAvailable: boolean;
  finalAvailable: boolean;
  filePath?: string;
  draftPreview?: string;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return response;
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
    },
  ): Promise<string> {
    const { projectId, projectSlug, topic, domainEvents } = params;

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
    const reporterParticipantId = selectReporterParticipantId(participants);

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
