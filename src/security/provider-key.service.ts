import { BadRequestException, Injectable } from '@nestjs/common';

import { MissingApiKeyError } from '../llm/llm.errors';

export const PROVIDER_API_KEY_ENV = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
} as const;

export type SupportedProviderName = keyof typeof PROVIDER_API_KEY_ENV;

@Injectable()
export class ProviderKeyService {
  private readonly availability = new Map<SupportedProviderName, boolean>();

  constructor() {
    for (const providerName of Object.keys(
      PROVIDER_API_KEY_ENV,
    ) as SupportedProviderName[]) {
      const envVarName = PROVIDER_API_KEY_ENV[providerName];
      this.availability.set(providerName, Boolean(process.env[envVarName]?.trim()));
    }
  }

  assertProviderAvailable(providerName: string): void {
    const envVarName = this.envVarNameForProvider(providerName);

    if (!this.availability.get(providerName as SupportedProviderName)) {
      throw new MissingApiKeyError(envVarName);
    }
  }

  envVarNameForProvider(providerName: string): string {
    if (!this.isSupportedProviderName(providerName)) {
      throw new BadRequestException(`Unsupported providerName: ${providerName}`);
    }

    return PROVIDER_API_KEY_ENV[providerName];
  }

  private isSupportedProviderName(
    providerName: string,
  ): providerName is SupportedProviderName {
    return providerName in PROVIDER_API_KEY_ENV;
  }
}
