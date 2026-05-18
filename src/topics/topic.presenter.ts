import { Topic } from '@prisma/client';

import { Audience } from '../common/audience';
import { TopicAnonymousDto, TopicHumanDto } from '../common/dto';

export function serializeTopic(
  topic: Topic,
  audience: Audience = 'human',
): TopicHumanDto | TopicAnonymousDto {
  const serialized = {
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
    reporterParticipantId: topic.reporterParticipantId,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };

  return audience === 'anonymous'
    ? (serialized as TopicAnonymousDto)
    : (serialized as TopicHumanDto);
}
