import { Participant } from '@prisma/client';

import { Audience } from '../common/audience';

export function serializeParticipant(
  participant: Participant,
  audience: Audience,
) {
  if (audience === 'anonymous') {
    return {
      anonymousName: participant.anonymousName,
    };
  }

  return {
    id: participant.id,
    projectId: participant.projectId,
    displayName: participant.displayName,
    anonymousName: participant.anonymousName,
    participantType: participant.participantType,
    providerName: participant.providerName,
    modelName: participant.modelName,
    clientName: participant.clientName,
    status: participant.status,
    joinOrder: participant.joinOrder,
    joinedAt: participant.joinedAt,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt,
  };
}

export function serializeRegisteredParticipant(
  participant: Participant,
  audience: Audience,
) {
  if (audience === 'anonymous') {
    return {
      participantId: participant.id,
      anonymousName: participant.anonymousName,
      joinOrder: participant.joinOrder,
    };
  }

  return serializeParticipant(participant, audience);
}
