import { Participant, Project, Topic } from '@prisma/client';

import { Audience } from '../common/audience';

type ProjectWithRelations = Project & {
  participants?: Participant[];
  topics?: Topic[];
};

function serializeTopic(topic: Topic) {
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

function serializeParticipant(participant: Participant, audience: Audience) {
  const base = {
    anonymousName: participant.anonymousName,
  };

  if (audience === 'anonymous') {
    return base;
  }

  return {
    ...base,
    id: participant.id,
    projectId: participant.projectId,
    participantType: participant.participantType,
    status: participant.status,
    joinOrder: participant.joinOrder,
    joinedAt: participant.joinedAt,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt,
    displayName: participant.displayName,
    providerName: participant.providerName,
    modelName: participant.modelName,
    clientName: participant.clientName,
  };
}

export function serializeProject(
  project: ProjectWithRelations,
  audience: Audience,
) {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    topics: project.topics?.map(serializeTopic),
    participants: project.participants?.map((participant) =>
      serializeParticipant(participant, audience),
    ),
  };
}
