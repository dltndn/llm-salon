export type ProviderFailureKind = 'bad_gateway' | 'timeout';

export class MissingApiKeyError extends Error {
  constructor(envVarName: string) {
    super(
      `Missing ${envVarName}. Set it in ~/.llm-salon/.env (copy from .env.example) and try again.`,
    );
    this.name = 'MissingApiKeyError';
  }
}

export class ProviderCallFailedError extends Error {
  constructor(
    providerName: string,
    reason: string,
    readonly failureKind: ProviderFailureKind = 'bad_gateway',
  ) {
    super(`${providerName} provider call failed: ${reason}`);
    this.name = 'ProviderCallFailedError';
  }
}

export class UnknownLlmProviderError extends Error {
  constructor(providerName: string) {
    super(`Unknown LLM provider: ${providerName}`);
    this.name = 'UnknownLlmProviderError';
  }
}
