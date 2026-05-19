export interface LlmModelMetadata {
  providerName: string;
  modelName: string;
  contextWindowTokens: number;
  recommendedMaxOutputTokens: number;
  defaultTimeoutMs?: number;
}

export const LLM_MODEL_METADATA = {
  'gpt-5.5': {
    providerName: 'openai',
    modelName: 'gpt-5.5',
    contextWindowTokens: 1_000_000,
    recommendedMaxOutputTokens: 128_000,
  },
  'gpt-5.4': {
    providerName: 'openai',
    modelName: 'gpt-5.4',
    contextWindowTokens: 1_000_000,
    recommendedMaxOutputTokens: 128_000,
  },
  'gpt-5.4-mini': {
    providerName: 'openai',
    modelName: 'gpt-5.4-mini',
    contextWindowTokens: 400_000,
    recommendedMaxOutputTokens: 128_000,
  },
  'gpt-4o': {
    providerName: 'openai',
    modelName: 'gpt-4o',
    contextWindowTokens: 128_000,
    recommendedMaxOutputTokens: 16_384,
  },
  'gpt-4o-mini': {
    providerName: 'openai',
    modelName: 'gpt-4o-mini',
    contextWindowTokens: 128_000,
    recommendedMaxOutputTokens: 16_384,
  },
  'gpt-4': {
    providerName: 'openai',
    modelName: 'gpt-4',
    contextWindowTokens: 8_192,
    recommendedMaxOutputTokens: 8_192,
  },
  'claude-sonnet-4-5': {
    providerName: 'anthropic',
    modelName: 'claude-sonnet-4-5',
    contextWindowTokens: 200_000,
    recommendedMaxOutputTokens: 64_000,
  },
  'claude-sonnet-4-5-20250929': {
    providerName: 'anthropic',
    modelName: 'claude-sonnet-4-5-20250929',
    contextWindowTokens: 200_000,
    recommendedMaxOutputTokens: 64_000,
  },
  'claude-haiku-4-5': {
    providerName: 'anthropic',
    modelName: 'claude-haiku-4-5',
    contextWindowTokens: 200_000,
    recommendedMaxOutputTokens: 64_000,
  },
  'claude-haiku-4-5-20251001': {
    providerName: 'anthropic',
    modelName: 'claude-haiku-4-5-20251001',
    contextWindowTokens: 200_000,
    recommendedMaxOutputTokens: 64_000,
  },
  'gemini-3-pro-preview': {
    providerName: 'google',
    modelName: 'gemini-3-pro-preview',
    contextWindowTokens: 1_048_576,
    recommendedMaxOutputTokens: 65_536,
  },
  'gemini-2.5-pro': {
    providerName: 'google',
    modelName: 'gemini-2.5-pro',
    contextWindowTokens: 1_048_576,
    recommendedMaxOutputTokens: 65_536,
  },
  'gemini-2.0-flash': {
    providerName: 'google',
    modelName: 'gemini-2.0-flash',
    contextWindowTokens: 1_048_576,
    recommendedMaxOutputTokens: 8_192,
  },
} as const satisfies Record<string, LlmModelMetadata>;

export type SupportedLlmModelName = keyof typeof LLM_MODEL_METADATA;

export function getModelMetadata(
  modelName: string,
): LlmModelMetadata | undefined {
  return LLM_MODEL_METADATA[modelName as SupportedLlmModelName];
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
