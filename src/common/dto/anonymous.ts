import {
  MessageKind,
  ParticipantStatus,
  ParticipantType,
  ProjectStatus,
  ReportStatus,
  TopicMode,
  TopicPhase,
  TurnStatus,
} from '@prisma/client';

declare const anonymousDtoBrand: unique symbol;

export interface AnonymousDto {
  readonly [anonymousDtoBrand]: 'anonymous';
}

export interface ProjectAnonymousDto extends AnonymousDto {
  id: string;
  slug: string;
  name: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  topics?: TopicAnonymousDto[];
  participants?: ParticipantAnonymousDto[];
}

export interface TopicAnonymousDto extends AnonymousDto {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  mode: TopicMode;
  phase: TopicPhase;
  maxRounds: number | null;
  maxTurns: number | null;
  currentRound: number;
  currentTurnIndex: number;
  version: number;
  reporterParticipantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParticipantAnonymousDto extends AnonymousDto {
  anonymousName: string;
}

export interface RegisteredParticipantAnonymousDto
  extends ParticipantAnonymousDto {
  participantId: string;
  joinOrder: number;
}

export interface DocumentAnonymousDto extends AnonymousDto {
  id: string;
  projectId: string;
  topicId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: bigint;
  contentHash: string;
  createdAt: Date;
}

export interface MessageAnonymousDto extends AnonymousDto {
  id: string;
  topicId: string;
  participant: ParticipantAnonymousDto | null;
  kind: MessageKind;
  phase: TopicPhase;
  content: string;
  turnIndex: number;
  roundIndex: number;
  createdAt: Date;
}

export interface TurnAnonymousDto extends AnonymousDto {
  id: string;
  topicId: string;
  participant: ParticipantAnonymousDto | null;
  phase: TopicPhase;
  status: TurnStatus;
  turnIndex: number;
  roundIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportAnonymousDto extends AnonymousDto {
  id: string;
  topicId: string;
  status: ReportStatus;
  draftContent: string | null;
  finalContent: string | null;
  filePath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParticipantReferenceAnonymousDto extends AnonymousDto {
  anonymousName: string;
  participantType?: ParticipantType;
  status?: ParticipantStatus;
}
