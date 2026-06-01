import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ParticipantStatus,
  TopicMode,
  TopicPhase,
  TurnStatus,
} from '@prisma/client';

import { Audience } from '../common/audience';
import { TopicHideNotAllowedError } from '../common/errors/domain.errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { serializeTopic } from './topic.presenter';

const HIDABLE_TOPIC_PHASES: TopicPhase[] = [
  TopicPhase.preparing,
  TopicPhase.finalized,
  TopicPhase.closed,
];

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTopic(
    projectSlug: string,
    dto: CreateTopicDto,
    audience: Audience = 'human',
  ) {
    const topic = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { slug: projectSlug },
        select: { id: true },
      });

      if (!project) {
        throw new NotFoundException(`Project not found: ${projectSlug}`);
      }

      const topic = await tx.topic.create({
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
      const firstParticipant = await tx.participant.findFirst({
        where: {
          projectId: project.id,
          status: { in: [ParticipantStatus.active, ParticipantStatus.waiting] },
        },
        orderBy: { joinOrder: 'asc' },
        select: { id: true },
      });

      if (!firstParticipant) {
        return topic;
      }

      await tx.turn.create({
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
      await tx.participant.updateMany({
        where: {
          id: firstParticipant.id,
          status: ParticipantStatus.waiting,
        },
        data: { status: ParticipantStatus.active },
      });

      return tx.topic.update({
        where: { id: topic.id },
        data: {
          currentTurnIndex: 1,
          version: { increment: 1 },
        },
      });
    });

    return serializeTopic(topic, audience);
  }

  async hideTopic(projectSlug: string, topicId: string) {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { slug: projectSlug },
        select: { id: true },
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

      await tx.$queryRaw`
        SELECT id FROM topics WHERE id = ${topic.id}::uuid FOR UPDATE
      `;

      const lockedTopic = await tx.topic.findFirst({
        where: { id: topic.id },
      });

      if (!lockedTopic) {
        throw new NotFoundException(`Topic not found: ${topicId}`);
      }

      if (lockedTopic.deletedAt) {
        return serializeTopic(lockedTopic, 'human');
      }

      if (!HIDABLE_TOPIC_PHASES.includes(lockedTopic.phase)) {
        throw new TopicHideNotAllowedError(lockedTopic.phase);
      }

      const hidden = await tx.topic.update({
        where: { id: lockedTopic.id },
        data: { deletedAt: new Date() },
      });

      return serializeTopic(hidden, 'human');
    });
  }
}
