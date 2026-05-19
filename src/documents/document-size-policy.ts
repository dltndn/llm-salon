import type { LlmSalonContextProfile } from '../config/env.schema';
import { DocumentTooLargeError } from '../common/errors/domain.errors';
import {
  getContextProfilePolicy,
  resolveContextProfile,
} from '../llm/context-policy';

export interface DocumentSizeInput {
  sizeBytes: bigint | number;
  profile?: LlmSalonContextProfile;
}

export function assertDocumentWithinProfileLimit(
  input: DocumentSizeInput,
): void {
  const profile = input.profile ?? resolveContextProfile();
  const limit = getContextProfilePolicy(profile).documentInlineLimitBytesPerFile;
  const sizeBytes =
    typeof input.sizeBytes === 'bigint'
      ? input.sizeBytes
      : BigInt(input.sizeBytes);

  if (sizeBytes > BigInt(limit)) {
    throw new DocumentTooLargeError(profile, formatBytes(limit));
  }
}

function formatBytes(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024)} MB`;
  }

  if (bytes % 1024 === 0) {
    return `${bytes / 1024} KB`;
  }

  return `${bytes} bytes`;
}
