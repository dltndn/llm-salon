import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TurnStatus } from '@prisma/client';

import { Audience } from '../common/audience';
import { PrismaService } from '../prisma/prisma.service';
import { serializeTurnStatus } from './turn.presenter';

@Injectable()
export class TurnsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTurn(
    projectSlug: string,
    topicId: string,
    participantId?: string,
    _audience: Audience = 'human',
  ) {
    void _audience;

    const { topic } = await this.findTopic(projectSlug, topicId);
    const [turn, participant] = await Promise.all([
      this.prisma.turn.findFirst({
        where: { topicId, status: TurnStatus.in_progress },
        orderBy: { turnIndex: 'desc' },
        include: {
          currentParticipant: {
            select: { id: true, anonymousName: true },
          },
        },
      }),
      participantId
        ? this.prisma.participant.findFirst({
            where: {
              id: participantId,
              projectId: topic.projectId,
            },
            select: { id: true, anonymousName: true },
          })
        : Promise.resolve(null),
    ]);

    if (participantId && !participant) {
      throw new NotFoundException(`Participant not found: ${participantId}`);
    }

    return serializeTurnStatus({ topic, turn, participant });
  }

  private async findTopic(projectSlug: string, topicId: string) {
    const project = await this.prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectSlug}`);
    }

    const topic = await this.prisma.topic.findFirst({
      where: { id: topicId, projectId: project.id },
    });

    if (!topic) {
      throw new NotFoundException(`Topic not found: ${topicId}`);
    }

    return { project, topic };
  }
}
