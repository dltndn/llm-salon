import { Participant } from '@prisma/client';

import { Audience } from '../common/audience';
import {
  ParticipantAnonymousDto,
  ParticipantHumanDto,
  RegisteredParticipantAnonymousDto,
} from '../common/dto';

export function serializeParticipant(
  participant: Participant,
  audience: Audience,
): ParticipantHumanDto | ParticipantAnonymousDto {
  if (audience === 'anonymous') {
    return {
      anonymousName: participant.anonymousName,
    } as ParticipantAnonymousDto;
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
  } as ParticipantHumanDto;
}

export function serializeRegisteredParticipant(
  participant: Participant,
  audience: Audience,
): ParticipantHumanDto | RegisteredParticipantAnonymousDto {
  if (audience === 'anonymous') {
    return {
      participantId: participant.id,
      anonymousName: participant.anonymousName,
      joinOrder: participant.joinOrder,
    } as RegisteredParticipantAnonymousDto;
  }

  return serializeParticipant(participant, audience) as ParticipantHumanDto;
}
