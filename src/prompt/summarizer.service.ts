import { Injectable } from '@nestjs/common';
import { ParticipantStatus, ParticipantType } from '@prisma/client';

import type { LlmContextMessage } from '../llm/llm-adapter.interface';
import { LlmProviderRegistry } from '../llm/llm-provider.registry';
import { SUMMARY_SYSTEM_PROMPT } from './summary-prompt';

export const OLDER_MESSAGES_OMITTED_PLACEHOLDER = '[older messages omitted]';

export interface SummaryParticipant {
  anonymousName: string;
  participantType: ParticipantType;
  status: ParticipantStatus;
  joinOrder: number;
  providerName?: string;
  modelName?: string;
}

export interface SummarizePreviousMessagesInput {
  participants: SummaryParticipant[];
  messages: LlmContextMessage[];
  maxRounds: number | null;
  currentRound: number;
  lastSummaryRound?: number;
}

export type PreviousMessageCompression =
  | { kind: 'summary'; message: LlmContextMessage }
  | { kind: 'sliding-window'; message: LlmContextMessage };

@Injectable()
export class SummarizerService {
  constructor(private readonly registry: LlmProviderRegistry) {}

  async compressOldMessages(
    input: SummarizePreviousMessagesInput,
  ): Promise<PreviousMessageCompression> {
    const owner = getFirstSummaryParticipant(input.participants);

    if (
      !owner ||
      owner.participantType !== ParticipantType.provider ||
      !owner.providerName ||
      !owner.modelName ||
      !shouldSummarizePreviousMessages(input)
    ) {
      return slidingWindowFallback();
    }

    try {
      const adapter = this.registry.get(owner.providerName);

      const result = await adapter.generate({
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
        contextMessages: input.messages,
        modelName: owner.modelName,
      });

      return {
        kind: 'summary',
        message: {
          role: 'user',
          content: `[summary] ${result.content}`,
        },
      };
    } catch {
      return slidingWindowFallback();
    }
  }
}

export function getSummaryCadenceRounds(maxRounds: number | null): number {
  return Math.max(2, Math.floor((maxRounds ?? 0) / 4));
}

export function shouldSummarizePreviousMessages(
  input: Pick<
    SummarizePreviousMessagesInput,
    'currentRound' | 'lastSummaryRound' | 'maxRounds'
  >,
): boolean {
  if (input.lastSummaryRound === undefined) {
    return true;
  }

  return (
    input.currentRound - input.lastSummaryRound >=
    getSummaryCadenceRounds(input.maxRounds)
  );
}

export function getFirstSummaryParticipant(
  participants: SummaryParticipant[],
): SummaryParticipant | null {
  const eligible = participants.filter(
    (participant) => participant.status !== ParticipantStatus.removed,
  );

  if (eligible.length === 0) {
    return null;
  }

  return eligible.reduce((first, participant) =>
    participant.joinOrder < first.joinOrder ? participant : first,
  );
}

function slidingWindowFallback(): PreviousMessageCompression {
  return {
    kind: 'sliding-window',
    message: {
      role: 'user',
      content: OLDER_MESSAGES_OMITTED_PLACEHOLDER,
    },
  };
}
