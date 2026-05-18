import { Injectable, NotFoundException } from '@nestjs/common';
import { TopicMode, TopicPhase } from '@prisma/client';

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

    return serializeTopic(
      await this.prisma.topic.create({
        data: {
          projectId: project.id,
          title: dto.title,
          description: dto.description,
          maxRounds: dto.maxRounds,
          maxTurns: dto.maxTurns,
          mode: TopicMode.consensus,
          phase: TopicPhase.preparing,
        },
      }),
      audience,
    );
  }
}
