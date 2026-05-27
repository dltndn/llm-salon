import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MessageKind,
  ParticipantStatus,
  Topic,
  TopicPhase,
  Turn,
  TurnStatus,
} from '@prisma/client';

import { Audience } from '../common/audience';
import { DOMAIN_EVENT } from '../events/domain-events';
import { DomainEventBus } from '../events/event-bus';
import { PrismaService } from '../prisma/prisma.service';
import {
  serializeTurnStatus,
  TurnWaitResponse,
  TurnWaitWakeupReason,
} from './turn.presenter';

const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const MAX_WAIT_TIMEOUT_MS = 30_000;

type TurnWithParticipant = Turn & {
  currentParticipant?: { id: string; anonymousName: string } | null;
};

type WaitForTurnOptions = {
  participantId?: string;
  afterTopicVersion?: string | number;
  timeoutMs?: string | number;
};

type WaitEvaluation = {
  response: TurnWaitResponse;
  shouldReturn: boolean;
};

@Injectable()
export class TurnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
  ) {}

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

  async waitForTurn(
    projectSlug: string,
    topicId: string,
    options: WaitForTurnOptions,
    _audience: Audience = 'human',
  ): Promise<TurnWaitResponse> {
    void _audience;

    const participantId = this.requireParticipantId(options.participantId);
    const afterTopicVersion = this.parseOptionalNumber(
      options.afterTopicVersion,
    );
    const timeoutMs = this.normalizeTimeoutMs(options.timeoutMs);
    const initial = await this.evaluateWaitState({
      projectSlug,
      topicId,
      participantId,
      afterTopicVersion,
      trigger: 'topic_updated',
    });

    if (initial.shouldReturn) {
      return initial.response;
    }

    return new Promise<TurnWaitResponse>((resolve, reject) => {
      let settled = false;
      const unsubscribe: Array<() => void> = [];

      const cleanup = () => {
        clearTimeout(timer);
        for (const stop of unsubscribe) {
          stop();
        }
      };

      const settle = (
        callback: () => Promise<TurnWaitResponse>,
      ): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        void callback().then(resolve, reject);
      };

      const evaluate = (trigger: TurnWaitWakeupReason) =>
        this.evaluateWaitState({
          projectSlug,
          topicId,
          participantId,
          afterTopicVersion,
          trigger,
        }).then((state) => {
          if (state.shouldReturn) {
            return state.response;
          }

          return null;
        });

      const timer = setTimeout(() => {
        settle(() =>
          this.buildWaitResponse({
            projectSlug,
            topicId,
            participantId,
            wakeupReason: 'timeout',
          }),
        );
      }, timeoutMs);

      const handleEvent = (
        trigger: TurnWaitWakeupReason,
        payload: { projectSlug?: string; topicId?: string },
      ) => {
        if (
          payload.projectSlug !== projectSlug ||
          (payload.topicId !== undefined && payload.topicId !== topicId)
        ) {
          return;
        }

        settle(async () => (await evaluate(trigger)) ?? (await this.buildWaitResponse({
          projectSlug,
          topicId,
          participantId,
          wakeupReason: trigger,
        })));
      };

      unsubscribe.push(
        this.events.on(DOMAIN_EVENT.messageCreated, (payload) =>
          handleEvent('topic_updated', payload),
        ),
        this.events.on(DOMAIN_EVENT.turnChanged, (payload) =>
          handleEvent('turn_changed', payload),
        ),
        this.events.on(DOMAIN_EVENT.topicPhaseChanged, (payload) =>
          handleEvent('phase_changed', payload),
        ),
        this.events.on(DOMAIN_EVENT.projectClosed, (payload) =>
          handleEvent('closed', payload),
        ),
      );

      void this.evaluateWaitState({
        projectSlug,
        topicId,
        participantId,
        afterTopicVersion,
        trigger: 'topic_updated',
      })
        .then((state) => {
          if (state.shouldReturn) {
            settle(() => Promise.resolve(state.response));
          }
        })
        .catch((error) => {
          if (!settled) {
            settled = true;
            cleanup();
            reject(error);
          }
        });
    });
  }

  private async evaluateWaitState(input: {
    projectSlug: string;
    topicId: string;
    participantId: string;
    afterTopicVersion: number | undefined;
    trigger: TurnWaitWakeupReason;
  }): Promise<WaitEvaluation> {
    const response = await this.buildWaitResponse({
      projectSlug: input.projectSlug,
      topicId: input.topicId,
      participantId: input.participantId,
      wakeupReason: input.trigger,
    });

    if (response.isMyTurn) {
      return {
        response: { ...response, wakeupReason: 'turn_changed' },
        shouldReturn: true,
      };
    }

    if (this.isClosedPhase(response.phase)) {
      return {
        response: { ...response, wakeupReason: 'closed' },
        shouldReturn: true,
      };
    }

    if (!this.isWaitablePhase(response.phase)) {
      return {
        response: { ...response, wakeupReason: 'phase_changed' },
        shouldReturn: true,
      };
    }

    if (
      input.afterTopicVersion !== undefined &&
      response.topicVersion > input.afterTopicVersion
    ) {
      return {
        response: { ...response, wakeupReason: 'topic_updated' },
        shouldReturn: true,
      };
    }

    return { response, shouldReturn: false };
  }

  private async buildWaitResponse(input: {
    projectSlug: string;
    topicId: string;
    participantId: string;
    wakeupReason: TurnWaitWakeupReason;
  }): Promise<TurnWaitResponse> {
    const { topic } = await this.findTopic(input.projectSlug, input.topicId);
    const [turn, participant] = await Promise.all([
      this.findCurrentTurn(input.topicId),
      this.prisma.participant.findFirst({
        where: {
          id: input.participantId,
          projectId: topic.projectId,
        },
        select: {
          id: true,
          anonymousName: true,
          status: true,
        },
      }),
    ]);

    if (!participant) {
      throw new NotFoundException(
        `Participant not found: ${input.participantId}`,
      );
    }

    const isMyTurn = await this.isParticipantTurn({
      topic,
      turn,
      participant,
    });
    const status = serializeTurnStatus({
      topic,
      turn,
      participant,
    });

    return {
      ...status,
      isMyTurn,
      mySelf: participant.anonymousName,
      wakeupReason: input.wakeupReason,
    };
  }

  private async isParticipantTurn(input: {
    topic: Topic;
    turn: TurnWithParticipant | null;
    participant: {
      id: string;
      anonymousName: string;
      status: ParticipantStatus;
    };
  }): Promise<boolean> {
    if (input.topic.phase === TopicPhase.reviewing) {
      if (input.participant.status !== ParticipantStatus.active) {
        return false;
      }

      const existingFeedback = await this.prisma.message.findFirst({
        where: {
          topicId: input.topic.id,
          participantId: input.participant.id,
          kind: MessageKind.feedback,
        },
        select: { id: true },
      });

      return existingFeedback === null;
    }

    return input.turn?.currentParticipant?.id === input.participant.id;
  }

  private findCurrentTurn(topicId: string): Promise<TurnWithParticipant | null> {
    return this.prisma.turn.findFirst({
      where: { topicId, status: TurnStatus.in_progress },
      orderBy: { turnIndex: 'desc' },
      include: {
        currentParticipant: {
          select: { id: true, anonymousName: true },
        },
      },
    }) as Promise<TurnWithParticipant | null>;
  }

  private requireParticipantId(participantId: string | undefined): string {
    if (!participantId?.trim()) {
      throw new BadRequestException('participantId is required.');
    }

    return participantId;
  }

  private parseOptionalNumber(value: string | number | undefined) {
    if (value === undefined || value === '') {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private normalizeTimeoutMs(value: string | number | undefined): number {
    const parsed = this.parseOptionalNumber(value) ?? DEFAULT_WAIT_TIMEOUT_MS;
    return Math.max(0, Math.min(parsed, MAX_WAIT_TIMEOUT_MS));
  }

  private isWaitablePhase(phase: string): boolean {
    return phase === TopicPhase.debating || phase === TopicPhase.reviewing;
  }

  private isClosedPhase(phase: string): boolean {
    return phase === TopicPhase.finalized || phase === TopicPhase.closed;
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
