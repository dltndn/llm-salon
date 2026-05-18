import { Injectable, NotFoundException } from '@nestjs/common';
import { Topic } from '@prisma/client';

import { serializeProject } from '../projects/project.presenter';
import { PrismaService } from '../prisma/prisma.service';

export type ProjectListViewModel = {
  projects: Array<{
    id: string;
    slug: string;
    name: string;
    status: string;
    createdAt: Date;
    topicCount: number;
    participantCount: number;
  }>;
};

export type DashboardViewModel = {
  project: ReturnType<typeof serializeProject>;
  selectedTopic: Topic | null;
  participants: Array<{
    id: string;
    displayName: string;
    status: string;
  }>;
  messages: Array<{
    id: string;
    displayName: string;
    content: string;
    phase: string;
    turnIndex: number;
    createdAt: Date;
  }>;
  currentTurn: {
    participantId: string | null;
    displayName: string;
    turnIndex: number;
    roundIndex: number;
  } | null;
  documents: Array<{
    id: string;
    fileName: string;
    sizeBytes: bigint;
  }>;
  report: {
    id: string;
    status: string;
    draftContent: string | null;
    finalContent: string | null;
    filePath: string | null;
  } | null;
};

@Injectable()
export class ViewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectList(): Promise<ProjectListViewModel> {
    const projects = await this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            topics: true,
            participants: true,
          },
        },
      },
    });

    return {
      projects: projects.map((project) => ({
        id: project.id,
        slug: project.slug,
        name: project.name,
        status: project.status,
        createdAt: project.createdAt,
        topicCount: project._count.topics,
        participantCount: project._count.participants,
      })),
    };
  }

  async getProjectDashboard(
    slug: string,
    topicId?: string,
  ): Promise<DashboardViewModel> {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      include: {
        participants: {
          orderBy: { joinOrder: 'asc' },
        },
        topics: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${slug}`);
    }

    const selectedTopic =
      project.topics.find((topic) => topic.id === topicId) ??
      project.topics[0] ??
      null;

    if (!selectedTopic) {
      return {
        project: serializeProject(project, 'human'),
        selectedTopic: null,
        participants: project.participants.map((participant) => ({
          id: participant.id,
          displayName: participant.displayName,
          status: participant.status,
        })),
        messages: [],
        currentTurn: null,
        documents: [],
        report: null,
      };
    }

    const [messages, currentTurn, documents, report] = await Promise.all([
      this.prisma.message.findMany({
        where: { topicId: selectedTopic.id },
        orderBy: { createdAt: 'asc' },
        include: {
          participant: {
            select: { displayName: true },
          },
        },
      }),
      this.prisma.turn.findFirst({
        where: {
          topicId: selectedTopic.id,
          status: 'in_progress',
        },
        orderBy: { turnIndex: 'desc' },
        include: {
          currentParticipant: {
            select: { id: true, displayName: true },
          },
        },
      }),
      this.prisma.document.findMany({
        where: { projectId: project.id, topicId: selectedTopic.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, fileName: true, sizeBytes: true },
      }),
      this.prisma.report.findFirst({
        where: { topicId: selectedTopic.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          draftContent: true,
          finalContent: true,
          filePath: true,
        },
      }),
    ]);

    return {
      project: serializeProject(project, 'human'),
      selectedTopic,
      participants: project.participants.map((participant) => ({
        id: participant.id,
        displayName: participant.displayName,
        status: participant.status,
      })),
      messages: messages.map((message) => ({
        id: message.id,
        displayName: message.participant.displayName,
        content: message.content,
        phase: message.phase,
        turnIndex: message.turnIndex,
        createdAt: message.createdAt,
      })),
      currentTurn: currentTurn
        ? {
            participantId: currentTurn.currentParticipantId,
            displayName: currentTurn.currentParticipant?.displayName ?? '',
            turnIndex: currentTurn.turnIndex,
            roundIndex: currentTurn.roundIndex,
          }
        : null,
      documents,
      report,
    };
  }
}
