import { Injectable } from '@nestjs/common';
import { MessageKind, ParticipantStatus, ParticipantType } from '@prisma/client';

import type { ActionType } from '../actions/action-resolver';

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
import {
  buildReportStageInstruction,
  buildReportSystemPromptWithOutputLanguage,
} from './report-prompts';
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

export type ContextTaskAction = Exclude<ActionType, 'none'>;

export interface ContextBuilderInput extends AnonymousDto {
  project: ProjectAnonymousDto;
  topic: TopicAnonymousDto;
  currentSpeaker: { anonymousName: string };
  caller: { anonymousName: string };
  participants: ContextParticipantAnonymousDto[];
  documents: ContextDocumentAnonymousDto[];
  previousMessages: MessageAnonymousDto[];
  reporterMember?: { anonymousName: string } | null;
  taskAction: ContextTaskAction;
  draftContent?: string | null;
  profile?: LlmSalonContextProfile;
  lastSummaryRound?: number;
  outputLanguage?: import('../config/env.schema').LlmSalonOutputLanguage;
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

    switch (input.taskAction) {
      case 'submit_review_feedback':
        return this.buildReviewFeedbackContext(input, options);
      case 'submit_report_draft':
        return this.buildReportDraftContext(input, options);
      case 'submit_report_final':
        return this.buildReportFinalContext(input, options);
      default:
        return this.buildDebateContext(input, options);
    }
  }

  private async buildDebateContext(
    input: ContextBuilderInput,
    options: ContextBuilderPrivateOptions,
  ): Promise<BuiltLlmContext> {
    const systemPrompt = buildDebateSystemPrompt(input.caller.anonymousName);
    const previousMessages = await this.buildDebatePreviousMessages(input, options);
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

  private async buildReviewFeedbackContext(
    input: ContextBuilderInput,
    options: ContextBuilderPrivateOptions,
  ): Promise<BuiltLlmContext> {
    const systemPrompt = buildDebateSystemPrompt(input.caller.anonymousName);
    const debateMessages = await this.buildDebatePreviousMessages(input, options);
    const contextMessages: LlmContextMessage[] = [
      { role: 'system', content: buildStateBlock(input) },
      { role: 'user', content: buildTopicBlock(input.topic) },
      ...buildDocumentMessages(input.documents),
      { role: 'user', content: buildParticipantBlock(input.participants) },
      ...debateMessages,
      {
        role: 'user',
        content: buildDraftBlock(input.draftContent ?? ''),
      },
      { role: 'user', content: buildReviewFeedbackInstruction(input.caller) },
      { role: 'assistant', content: '' },
    ];
    const output = { systemPrompt, contextMessages };

    assertNoHumanIdentifierText(output);
    return output;
  }

  private async buildReportDraftContext(
    input: ContextBuilderInput,
    options: ContextBuilderPrivateOptions,
  ): Promise<BuiltLlmContext> {
    const reporterName =
      input.reporterMember?.anonymousName ?? input.caller.anonymousName;
    const systemPrompt = buildReportSystemPromptWithOutputLanguage(
      'drafting',
      reporterName,
      input.outputLanguage ?? 'en',
    );
    const debateMessages = await this.buildDebatePreviousMessages(input, options);
    const contextMessages: LlmContextMessage[] = [
      { role: 'system', content: buildReportStateBlock(input, reporterName) },
      { role: 'user', content: buildTopicBlock(input.topic) },
      ...buildDocumentMessages(input.documents),
      { role: 'user', content: buildParticipantBlock(input.participants) },
      ...debateMessages,
      { role: 'user', content: buildReportStageInstruction('drafting') },
      { role: 'assistant', content: '' },
    ];
    const output = { systemPrompt, contextMessages };

    assertNoHumanIdentifierText(output);
    return output;
  }

  private async buildReportFinalContext(
    input: ContextBuilderInput,
    options: ContextBuilderPrivateOptions,
  ): Promise<BuiltLlmContext> {
    const reporterName =
      input.reporterMember?.anonymousName ?? input.caller.anonymousName;
    const systemPrompt = buildReportSystemPromptWithOutputLanguage(
      'finalizing',
      reporterName,
      input.outputLanguage ?? 'en',
    );
    const debateMessages = await this.buildDebatePreviousMessages(input, options);
    const feedbackMessages = input.previousMessages.filter(
      (message) => message.kind === MessageKind.feedback,
    );
    const contextMessages: LlmContextMessage[] = [
      { role: 'system', content: buildReportStateBlock(input, reporterName) },
      { role: 'user', content: buildTopicBlock(input.topic) },
      ...buildDocumentMessages(input.documents),
      { role: 'user', content: buildParticipantBlock(input.participants) },
      ...debateMessages,
      {
        role: 'user',
        content: buildDraftBlock(input.draftContent ?? ''),
      },
      {
        role: 'user',
        content: buildFeedbackBlock(feedbackMessages),
      },
      { role: 'user', content: buildReportStageInstruction('finalizing') },
      { role: 'assistant', content: '' },
    ];
    const output = { systemPrompt, contextMessages };

    assertNoHumanIdentifierText(output);
    return output;
  }

  private async buildDebatePreviousMessages(
    input: ContextBuilderInput,
    options: ContextBuilderPrivateOptions,
  ): Promise<LlmContextMessage[]> {
    const debateMessages = input.previousMessages.filter(
      (message) => message.kind === MessageKind.statement,
    );
    const messages = debateMessages.map((message) => ({
      role: 'user' as const,
      content: `${message.participant?.anonymousName ?? 'Unknown member'}: ${
        message.content
      }\n[debate_signal: ${message.debateSignal}]`,
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
    'Respond with a JSON object containing string fields "content" and "debateSignal".',
    'Use debateSignal "ready_to_finalize" only when the discussion has enough material for the report and you have no unresolved objection that requires another debate turn. Otherwise use "continue".',
  ].join('\n');
}

function buildReviewFeedbackInstruction(caller: {
  anonymousName: string;
}): string {
  return [
    '[review instruction]',
    `Caller: ${caller.anonymousName}`,
    'Submit concise feedback on the draft report. Respond with plain text only.',
  ].join('\n');
}

function buildReportStateBlock(
  input: ContextBuilderInput,
  reporterAnonymousName: string,
): string {
  return [
    '[system status]',
    `project: ${input.project.slug}`,
    `phase: ${input.topic.phase}`,
    `mode: ${input.topic.mode}`,
    `reporter_member: ${reporterAnonymousName}`,
    `caller: ${input.caller.anonymousName}`,
  ].join('\n');
}

function buildDraftBlock(draftContent: string): string {
  return `[draft report]\n${draftContent}`;
}

function buildFeedbackBlock(messages: MessageAnonymousDto[]): string {
  if (messages.length === 0) {
    return '[member feedback]\n(none)';
  }

  return [
    '[member feedback]',
    ...messages.map(
      (message) =>
        `${message.participant?.anonymousName ?? 'Unknown member'}: ${message.content}`,
    ),
  ].join('\n');
}
