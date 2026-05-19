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
