import { Topic } from '@prisma/client';

export function serializeTopic(topic: Topic) {
  return {
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
}
