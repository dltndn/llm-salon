import {
  Participant,
  ParticipantStatus,
  ParticipantType,
} from '@prisma/client';

export type ReporterCandidate = Pick<
  Participant,
  'id' | 'joinOrder' | 'participantType' | 'status'
>;

export function selectReporterParticipantId(
  participants: ReporterCandidate[],
): string | null {
  const activeProviders = participants
    .filter(
      (participant) =>
        participant.participantType === ParticipantType.provider &&
        participant.status === ParticipantStatus.active,
    )
    .sort((left, right) => left.joinOrder - right.joinOrder);

  return activeProviders[0]?.id ?? null;
}
