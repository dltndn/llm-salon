import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ParticipantStatus,
  TopicMode,
  TopicPhase,
  TurnStatus,
} from '@prisma/client';

import { Audience } from '../common/audience';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { serializeTopic } from './topic.presenter';

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTopic(
    projectSlug: string,
    dto: CreateTopicDto,
    audience: Audience = 'human',
  ) {
    const project = await this.prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectSlug}`);
    }

    const topic = await this.prisma.topic.create({
      data: {
        projectId: project.id,
        title: dto.title,
        description: dto.description,
        maxRounds: dto.maxRounds,
        maxTurns: dto.maxTurns,
        mode: dto.mode ?? TopicMode.consensus,
        phase: TopicPhase.preparing,
      },
    });
    const firstParticipant = await this.prisma.participant.findFirst({
      where: {
        projectId: project.id,
        status: { in: [ParticipantStatus.active, ParticipantStatus.waiting] },
      },
      orderBy: { joinOrder: 'asc' },
      select: { id: true },
    });

    if (firstParticipant) {
      await this.prisma.turn.create({
        data: {
          projectId: project.id,
          topicId: topic.id,
          currentParticipantId: firstParticipant.id,
          turnIndex: 1,
          roundIndex: 0,
          phase: topic.phase,
          status: TurnStatus.in_progress,
        },
      });
      await this.prisma.topic.update({
        where: { id: topic.id },
        data: {
          currentTurnIndex: 1,
          version: { increment: 1 },
        },
      });
      topic.currentTurnIndex = 1;
      topic.version += 1;
    }

    return serializeTopic(topic, audience);
  }
}
