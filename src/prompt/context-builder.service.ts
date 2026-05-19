import { Injectable } from '@nestjs/common';
import { ParticipantStatus, ParticipantType } from '@prisma/client';

import type {
  AnonymousDto,
  DocumentAnonymousDto,
  MessageAnonymousDto,
  ProjectAnonymousDto,
  TopicAnonymousDto,
} from '../common/dto';
import { assertAnonymousPayload } from '../common/interceptors/anonymous-guard.interceptor';
import type { LlmSalonContextProfile } from '../config/env.schema';
import { getContextProfilePolicy } from '../llm/context-policy';
import type { LlmContextMessage } from '../llm/llm-adapter.interface';
import { assertNoHumanIdentifierText } from './prompt-input';
import { buildDebateSystemPrompt } from './system-prompt';
import {
  type SummaryParticipant,
  SummarizerService,
} from './summarizer.service';

export interface ContextParticipantAnonymousDto {
  anonymousName: string;
  participantType: ParticipantType;
  status: ParticipantStatus;
  joinOrder: number;
}

export interface ContextDocumentAnonymousDto extends DocumentAnonymousDto {
  content: string;
}

export interface ContextBuilderInput extends AnonymousDto {
  project: ProjectAnonymousDto;
  topic: TopicAnonymousDto;
  currentSpeaker: { anonymousName: string };
  caller: { anonymousName: string };
  participants: ContextParticipantAnonymousDto[];
  documents: ContextDocumentAnonymousDto[];
  previousMessages: MessageAnonymousDto[];
  reporterMember?: { anonymousName: string } | null;
  profile?: LlmSalonContextProfile;
  lastSummaryRound?: number;
}

export interface ContextBuilderPrivateOptions {
  summaryParticipants: SummaryParticipant[];
}

export interface BuiltLlmContext {
  systemPrompt: string;
  contextMessages: LlmContextMessage[];
}

@Injectable()
export class ContextBuilderService {
  constructor(private readonly summarizer: SummarizerService) {}

  async build(
    input: ContextBuilderInput,
    options: ContextBuilderPrivateOptions,
  ): Promise<BuiltLlmContext> {
    assertAnonymousPayload(toAnonymousPayload(input));
    assertNoHumanIdentifierText(input);

    const systemPrompt = buildDebateSystemPrompt(input.caller.anonymousName);
    const previousMessages = await this.buildPreviousMessages(input, options);

    const contextMessages: LlmContextMessage[] = [
      { role: 'system', content: buildStateBlock(input) },
      { role: 'user', content: buildTopicBlock(input.topic) },
      ...buildDocumentMessages(input.documents),
      { role: 'user', content: buildParticipantBlock(input.participants) },
      ...previousMessages,
      { role: 'user', content: buildTurnInstruction(input.caller) },
      { role: 'assistant', content: '' },
    ];

    const output = { systemPrompt, contextMessages };
    assertNoHumanIdentifierText(output);
    return output;
  }

  private async buildPreviousMessages(
    input: ContextBuilderInput,
    options: ContextBuilderPrivateOptions,
  ): Promise<LlmContextMessage[]> {
    const messages = input.previousMessages.map((message) => ({
      role: 'user' as const,
      content: `${message.participant?.anonymousName ?? 'Unknown member'}: ${
        message.content
      }`,
    }));

    const policy = getContextProfilePolicy(input.profile);
    const retainedCount = Math.ceil(
      messages.length * policy.previousMessageRetentionRatio,
    );

    if (messages.length === 0 || retainedCount >= messages.length) {
      return messages;
    }

    const oldMessages = messages.slice(0, messages.length - retainedCount);
    const retainedMessages = messages.slice(messages.length - retainedCount);
    const compression = await this.summarizer.compressOldMessages({
      participants:
        options.summaryParticipants,
      messages: oldMessages,
      currentRound: input.topic.currentRound,
      maxRounds: input.topic.maxRounds,
      lastSummaryRound: input.lastSummaryRound,
    });

    return [compression.message, ...retainedMessages];
  }
}

function toAnonymousPayload(input: ContextBuilderInput): Record<string, unknown> {
  return {
    project: input.project,
    topic: input.topic,
    participants: input.participants,
    documents: input.documents,
    messages: input.previousMessages,
    currentMember: input.currentSpeaker,
    mySelf: input.caller,
    reporterMember: input.reporterMember ?? null,
  };
}

function buildStateBlock(input: ContextBuilderInput): string {
  return [
    '[system status]',
    `project: ${input.project.slug}`,
    `phase: ${input.topic.phase}`,
    `mode: ${input.topic.mode}`,
    `round: ${input.topic.currentRound} / ${input.topic.maxRounds ?? 'unlimited'}`,
    `turn_index: ${input.topic.currentTurnIndex} / ${
      input.topic.maxTurns ?? 'unlimited'
    }`,
    `current_speaker: ${input.currentSpeaker.anonymousName}`,
    `caller: ${input.caller.anonymousName}`,
    `active_participant_count: ${
      input.participants.filter(
        (participant) => participant.status === ParticipantStatus.active,
      ).length
    }`,
    `reporter_member: ${input.reporterMember?.anonymousName ?? 'unassigned'}`,
  ].join('\n');
}

function buildTopicBlock(topic: TopicAnonymousDto): string {
  return [
    '[topic]',
    `title: ${topic.title}`,
    `description: ${topic.description ?? ''}`,
  ].join('\n');
}

function buildDocumentMessages(
  documents: ContextDocumentAnonymousDto[],
): LlmContextMessage[] {
  return documents.map((document) => ({
    role: 'user',
    content: [
      '[document]',
      `file_name: ${document.fileName}`,
      `mime_type: ${document.mimeType}`,
      document.content,
    ].join('\n'),
  }));
}

function buildParticipantBlock(
  participants: ContextParticipantAnonymousDto[],
): string {
  return [
    '[participants]',
    ...participants.map(
      (participant) =>
        `${participant.joinOrder}. ${participant.anonymousName} (${participant.status})`,
    ),
  ].join('\n');
}

function buildTurnInstruction(caller: { anonymousName: string }): string {
  return [
    '[turn instruction]',
    `Caller: ${caller.anonymousName}`,
    'Respond with the next debate message as plain text.',
  ].join('\n');
}
