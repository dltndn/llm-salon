export type LlmMessageRole = 'system' | 'user' | 'assistant';

export interface LlmContextMessage {
  role: LlmMessageRole;
  content: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LlmGenerateInput {
  systemPrompt: string;
  contextMessages: LlmContextMessage[];
  modelName: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmGenerateResult {
  content: string;
  usage?: TokenUsage;
}

export interface LlmAdapter {
  readonly providerName: string;
  generate(input: LlmGenerateInput): Promise<LlmGenerateResult>;
}
