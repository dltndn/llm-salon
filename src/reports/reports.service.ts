import { Injectable, NotFoundException } from '@nestjs/common';
import { ReportStatus } from '@prisma/client';

import { Audience } from '../common/audience';
import { PrismaService } from '../prisma/prisma.service';

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
}
