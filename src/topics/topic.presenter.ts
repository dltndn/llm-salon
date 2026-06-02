import { Participant, Topic, TopicPhase } from '@prisma/client';

import { Audience } from '../common/audience';
import { TopicAnonymousDto, TopicHumanDto } from '../common/dto';

const REPORTER_MEMBER_PHASES = new Set<TopicPhase>([
  TopicPhase.drafting,
  TopicPhase.finalizing,
]);

export function resolveReporterMemberName(
  topic: Pick<Topic, 'phase' | 'reporterParticipantId'>,
  participants: Participant[] | undefined,
): string | null {
  if (
    !topic.reporterParticipantId ||
    !REPORTER_MEMBER_PHASES.has(topic.phase) ||
    !participants
  ) {
    return null;
  }

  return (
    participants.find(
      (participant) => participant.id === topic.reporterParticipantId,
    )?.anonymousName ?? null
  );
}

export function serializeTopic(
  topic: Topic,
  audience: Audience = 'human',
  participants?: Participant[],
): TopicHumanDto | TopicAnonymousDto {
  const base = {
    id: topic.id,
    projectId: topic.projectId,
    title: topic.title,
    description: topic.description,
    mode: topic.mode,
    phase: topic.phase,
    maxRounds: topic.maxRounds,
    maxTurns: topic.maxTurns,
    currentRound: topic.currentRound,
    currentTurnIndex: topic.currentTurnIndex,
    version: topic.version,
    reporterParticipantId: topic.reporterParticipantId,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };

  if (audience === 'anonymous') {
    return {
      ...base,
      reporterMember: resolveReporterMemberName(topic, participants),
    } as TopicAnonymousDto & { reporterMember?: string | null };
  }

  return { ...base, deletedAt: topic.deletedAt } as TopicHumanDto;
}
