import { TopicPhase, Turn } from '@prisma/client';

export type SubmittedMessageDto = {
  messageId: string;
  nextMember: string | null;
  phaseAfter: TopicPhase;
};

export function serializeSubmittedMessage(input: {
  messageId: string;
  nextTurn: (Turn & { currentParticipant?: { anonymousName: string } | null }) | null;
  phaseAfter: TopicPhase;
}): SubmittedMessageDto {
  return {
    messageId: input.messageId,
    nextMember: input.nextTurn?.currentParticipant?.anonymousName ?? null,
    phaseAfter: input.phaseAfter,
  };
}
