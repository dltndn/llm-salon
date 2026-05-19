import {
  type LlmSalonContextProfile,
  normalizeContextProfile,
} from '../config/env.schema';
import type { LlmModelMetadata } from './models';

const KIB = 1024;
const MIB = 1024 * KIB;

export interface ContextProfilePolicy {
  profile: LlmSalonContextProfile;
  modelWindowUsageRatio: number;
  documentInlineLimitBytesPerFile: number;
  documentInlineLimitBytesPerProject: number;
  previousMessageRetentionRatio: number;
}

export interface ContextTokenBudget {
  profile: LlmSalonContextProfile;
  modelName: string;
  contextWindowTokens: number;
  maxContextTokens: number;
  recommendedMaxOutputTokens: number;
  maxInputTokens: number;
}

export const CONTEXT_PROFILE_POLICIES = {
  low: {
    profile: 'low',
    modelWindowUsageRatio: 0.25,
    documentInlineLimitBytesPerFile: 64 * KIB,
    documentInlineLimitBytesPerProject: 256 * KIB,
    previousMessageRetentionRatio: 0.3,
  },
  medium: {
    profile: 'medium',
    modelWindowUsageRatio: 0.5,
    documentInlineLimitBytesPerFile: 128 * KIB,
    documentInlineLimitBytesPerProject: 512 * KIB,
    previousMessageRetentionRatio: 0.6,
  },
  high: {
    profile: 'high',
    modelWindowUsageRatio: 0.8,
    documentInlineLimitBytesPerFile: 256 * KIB,
    documentInlineLimitBytesPerProject: 1 * MIB,
    previousMessageRetentionRatio: 0.9,
  },
} as const satisfies Record<LlmSalonContextProfile, ContextProfilePolicy>;

export function resolveContextProfile(
  value: unknown = process.env.LLM_SALON_CONTEXT_PROFILE,
): LlmSalonContextProfile {
  return normalizeContextProfile(value);
}

export function getContextProfilePolicy(
  profile: LlmSalonContextProfile = resolveContextProfile(),
): ContextProfilePolicy {
  return CONTEXT_PROFILE_POLICIES[profile];
}

export function calculateContextTokenBudget(
  model: LlmModelMetadata,
  profile: LlmSalonContextProfile = resolveContextProfile(),
): ContextTokenBudget {
  const policy = getContextProfilePolicy(profile);
  const maxContextTokens = Math.floor(
    model.contextWindowTokens * policy.modelWindowUsageRatio,
  );

  const recommendedMaxOutputTokens = Math.min(
    model.recommendedMaxOutputTokens,
    maxContextTokens,
  );

  return {
    profile,
    modelName: model.modelName,
    contextWindowTokens: model.contextWindowTokens,
    maxContextTokens,
    recommendedMaxOutputTokens,
    maxInputTokens: maxContextTokens,
  };
}
