export class MissingApiKeyError extends Error {
  constructor(envVarName: string) {
    super(`Missing ${envVarName}. Set it in ~/.llm-salon/.env and try again.`);
    this.name = 'MissingApiKeyError';
  }
}

export class ProviderCallFailedError extends Error {
  constructor(providerName: string, reason: string) {
    super(`${providerName} provider call failed: ${reason}`);
    this.name = 'ProviderCallFailedError';
  }
}
