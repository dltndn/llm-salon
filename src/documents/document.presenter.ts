import { Document } from '@prisma/client';

export type DocumentAnonymousResponse = {
  id: string;
  projectId: string;
  topicId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  createdAt: Date;
};

export type DocumentHumanResponse = DocumentAnonymousResponse & {
  filePath: string;
};

export function serializeDocument(document: Document): DocumentAnonymousResponse {
  return {
    id: document.id,
    projectId: document.projectId,
    topicId: document.topicId,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: Number(document.sizeBytes),
    contentHash: document.contentHash,
    createdAt: document.createdAt,
  };
}

export function serializeHumanDocument(document: Document): DocumentHumanResponse {
  return {
    ...serializeDocument(document),
    filePath: document.filePath,
  };
}
