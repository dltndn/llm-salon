import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ParticipantStatus,
  ParticipantType,
  Prisma,
  Project,
  TopicPhase,
} from '@prisma/client';

import { Audience } from '../common/audience';
import {
  DuplicateAppRegistrationError,
  ParticipantConflictError,
  RegistrationClosedError,
} from '../common/errors/domain.errors';
import { DOMAIN_EVENT, DomainEvent } from '../events/domain-events';
import { DomainEventBus } from '../events/event-bus';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderKeyService } from '../security/provider-key.service';
import { anonymousNameForJoinOrder } from './anonymous-name';
import { RegisterParticipantDto } from './dto/register-participant.dto';
import { serializeRegisteredParticipant } from './participant.presenter';

type ParticipantTransaction = Prisma.TransactionClient;

@Injectable()
export class ParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
    private readonly providerKeys: ProviderKeyService,
  ) {}

  async registerParticipant(
    projectSlug: string,
    dto: RegisterParticipantDto,
    audience: Audience,
  ) {
    const normalized = this.normalizeRegistration(dto);

    if (normalized.participantType === ParticipantType.provider) {
      this.providerKeys.assertProviderAvailable(normalized.providerName);
    }

    const domainEvents: DomainEvent[] = [];
    const participant = await this.prisma.$transaction(async (tx) => {
      const project = await this.findProjectForRegistration(tx, projectSlug);

      await tx.$queryRaw`
        SELECT id FROM projects WHERE id = ${project.id}::uuid FOR UPDATE
      `;
      await this.assertRegistrationOpen(tx, project);

      const joinOrder = await this.nextJoinOrder(tx, project.id);

      try {
        const participant = await tx.participant.create({
          data: {
            projectId: project.id,
            displayName: normalized.displayName,
            anonymousName: anonymousNameForJoinOrder(joinOrder),
            participantType: normalized.participantType,
            providerName: normalized.providerName,
            modelName: normalized.modelName,
            clientName: normalized.clientName,
            status: ParticipantStatus.waiting,
            joinOrder,
          },
        });
        domainEvents.push({
          type: DOMAIN_EVENT.participantJoined,
          payload: {
            projectId: project.id,
            projectSlug: project.slug,
            participant: {
              id: participant.id,
              displayName: participant.displayName,
              status: participant.status,
            },
          },
        });

        return participant;
      } catch (error) {
        this.rethrowRegistrationConflict(error, normalized);
        throw error;
      }
    });

    for (const event of domainEvents) {
      this.events.emit(event);
    }

    return serializeRegisteredParticipant(participant, audience);
  }

  private async findProjectForRegistration(
    tx: ParticipantTransaction,
    slug: string,
  ): Promise<Project> {
    const project = await tx.project.findUnique({
      where: { slug },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${slug}`);
    }

    return project;
  }

  private normalizeRegistration(dto: RegisterParticipantDto) {
    if (dto.participantType === 'app') {
      if (!dto.clientName) {
        throw new BadRequestException(
          'clientName is required for app participants',
        );
      }

      return {
        participantType: ParticipantType.app,
        clientName: dto.clientName,
        providerName: null,
        modelName: dto.modelName,
        displayName: `${dto.clientName} / ${dto.modelName}`,
      };
    }

    if (!dto.providerName) {
      throw new BadRequestException(
        'providerName is required for provider participants',
      );
    }

    return {
      participantType: ParticipantType.provider,
      clientName: null,
      providerName: dto.providerName.toLowerCase(),
      modelName: dto.modelName,
      displayName: dto.modelName,
    };
  }

  private async nextJoinOrder(
    tx: ParticipantTransaction,
    projectId: string,
  ): Promise<number> {
    const result = await tx.participant.aggregate({
      where: { projectId },
      _max: { joinOrder: true },
    });

    return (result._max.joinOrder ?? 0) + 1;
  }

  private async assertRegistrationOpen(
    tx: ParticipantTransaction,
    project: Project,
  ): Promise<void> {
    const closedTopic = await tx.topic.findFirst({
      where: {
        projectId: project.id,
        phase: {
          in: [
            TopicPhase.drafting,
            TopicPhase.reviewing,
            TopicPhase.finalizing,
            TopicPhase.finalized,
            TopicPhase.closed,
          ],
        },
      },
      select: { id: true },
    });

    if (closedTopic) {
      throw new RegistrationClosedError(project.slug);
    }
  }

  private rethrowRegistrationConflict(
    error: unknown,
    normalized: ReturnType<ParticipantsService['normalizeRegistration']>,
  ): void {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return;
    }

    if (normalized.participantType === ParticipantType.app) {
      throw new DuplicateAppRegistrationError(
        normalized.clientName,
        normalized.modelName,
      );
    }

    throw new ParticipantConflictError(
      `Provider participant is already registered: ${normalized.providerName} / ${normalized.modelName}`,
    );
  }
}
