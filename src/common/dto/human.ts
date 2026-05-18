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

declare const humanDtoBrand: unique symbol;

export interface HumanDto {
  readonly [humanDtoBrand]: 'human';
}

export interface ProjectHumanDto extends HumanDto {
  id: string;
  slug: string;
  name: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  topics?: TopicHumanDto[];
  participants?: ParticipantHumanDto[];
}

export interface TopicHumanDto extends HumanDto {
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
  reporterParticipantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParticipantHumanDto extends HumanDto {
  id: string;
  projectId: string;
  displayName: string;
  anonymousName: string;
  participantType: ParticipantType;
  providerName: string | null;
  modelName: string | null;
  clientName: string | null;
  status: ParticipantStatus;
  joinOrder: number;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentHumanDto extends HumanDto {
  id: string;
  projectId: string;
  topicId: string | null;
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: bigint;
  contentHash: string;
  createdAt: Date;
}

export interface MessageHumanDto extends HumanDto {
  id: string;
  topicId: string;
  participant: ParticipantHumanDto | null;
  kind: MessageKind;
  phase: TopicPhase;
  content: string;
  turnIndex: number;
  roundIndex: number;
  createdAt: Date;
}

export interface TurnHumanDto extends HumanDto {
  id: string;
  topicId: string;
  participant: ParticipantHumanDto | null;
  phase: TopicPhase;
  status: TurnStatus;
  turnIndex: number;
  roundIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportHumanDto extends HumanDto {
  id: string;
  topicId: string;
  status: ReportStatus;
  draftContent: string | null;
  finalContent: string | null;
  filePath: string | null;
  createdAt: Date;
  updatedAt: Date;
}
