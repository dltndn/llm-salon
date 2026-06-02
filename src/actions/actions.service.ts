import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TurnStatus } from '@prisma/client';

import { Audience } from '../common/audience';
import { DOMAIN_EVENT } from '../events/domain-events';
import { DomainEventBus } from '../events/event-bus';
import { PrismaService } from '../prisma/prisma.service';
import {
  isClosedPhase,
  isWaitablePhase,
  participantHasFeedback,
  resolveCallerAction,
} from './action-resolver';
import {
  ActionWaitResponse,
  ActionWaitWakeupReason,
  serializeActionWaitResponse,
} from './action.presenter';

const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const MAX_WAIT_TIMEOUT_MS = 30_000;

type WaitForActionOptions = {
  participantId?: string;
  afterTopicVersion?: string | number;
  timeoutMs?: string | number;
};

type WaitEvaluation = {
  response: ActionWaitResponse;
  shouldReturn: boolean;
};

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
  ) {}

  async waitForAction(
    projectSlug: string,
    topicId: string,
    options: WaitForActionOptions,
    _audience: Audience = 'human',
  ): Promise<ActionWaitResponse> {
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
      immediateIfActionable: true,
    });

    if (initial.shouldReturn || timeoutMs === 0) {
      if (timeoutMs === 0 && !initial.shouldReturn) {
        return this.buildWaitResponse({
          projectSlug,
          topicId,
          participantId,
          wakeupReason: 'timeout',
        });
      }

      return initial.response;
    }

    return new Promise<ActionWaitResponse>((resolve, reject) => {
      let settled = false;
      const unsubscribe: Array<() => void> = [];

      const cleanup = () => {
        clearTimeout(timer);
        for (const stop of unsubscribe) {
          stop();
        }
      };

      const settle = (
        callback: () => Promise<ActionWaitResponse>,
      ): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        void callback().then(resolve, reject);
      };

      const evaluate = (trigger: ActionWaitWakeupReason) =>
        this.evaluateWaitState({
          projectSlug,
          topicId,
          participantId,
          afterTopicVersion,
          trigger,
          immediateIfActionable: false,
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
        trigger: ActionWaitWakeupReason,
        payload: { projectSlug?: string; topicId?: string },
      ) => {
        if (
          payload.projectSlug !== projectSlug ||
          (payload.topicId !== undefined && payload.topicId !== topicId)
        ) {
          return;
        }

        settle(async () => {
          const evaluated = await evaluate(trigger);

          return (
            evaluated ??
            (await this.buildWaitResponse({
              projectSlug,
              topicId,
              participantId,
              wakeupReason: trigger,
            }))
          );
        });
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
        this.events.on(DOMAIN_EVENT.reportDraftCreated, (payload) =>
          handleEvent('topic_updated', payload),
        ),
        this.events.on(DOMAIN_EVENT.reportCreated, (payload) =>
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
        immediateIfActionable: false,
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
    trigger: ActionWaitWakeupReason;
    immediateIfActionable: boolean;
  }): Promise<WaitEvaluation> {
    const response = await this.buildWaitResponse({
      projectSlug: input.projectSlug,
      topicId: input.topicId,
      participantId: input.participantId,
      wakeupReason: input.trigger,
    });

    if (response.isActionable) {
      return {
        response: {
          ...response,
          wakeupReason: input.immediateIfActionable
            ? 'immediate'
            : input.trigger,
        },
        shouldReturn: true,
      };
    }

    if (isClosedPhase(response.phase)) {
      return {
        response: { ...response, wakeupReason: 'closed' },
        shouldReturn: true,
      };
    }

    if (!isWaitablePhase(response.phase, response.isActionable)) {
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
    wakeupReason: ActionWaitWakeupReason;
  }): Promise<ActionWaitResponse> {
    const { topic } = await this.findTopic(input.projectSlug, input.topicId);
    const [turn, participant, reporter] = await Promise.all([
      this.prisma.turn.findFirst({
        where: { topicId: input.topicId, status: TurnStatus.in_progress },
        orderBy: { turnIndex: 'desc' },
        include: {
          currentParticipant: {
            select: { id: true, anonymousName: true },
          },
        },
      }),
      this.prisma.participant.findFirst({
        where: {
          id: input.participantId,
          projectId: topic.projectId,
        },
        select: {
          id: true,
          anonymousName: true,
          status: true,
          participantType: true,
        },
      }),
      topic.reporterParticipantId
        ? this.prisma.participant.findFirst({
            where: { id: topic.reporterParticipantId },
            select: {
              id: true,
              anonymousName: true,
              participantType: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!participant) {
      throw new NotFoundException(
        `Participant not found: ${input.participantId}`,
      );
    }

    const hasFeedback = await participantHasFeedback(
      this.prisma,
      topic.id,
      participant.id,
    );
    const resolved = await resolveCallerAction({
      topic,
      participant,
      turn,
      reporter,
      hasFeedback,
    });

    return serializeActionWaitResponse({
      topic,
      isActionable: resolved.isActionable,
      action: resolved.action,
      assignedMember: resolved.assignedMember,
      mySelf: participant.anonymousName,
      wakeupReason: input.wakeupReason,
    });
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
