import { Injectable } from '@nestjs/common';

import type { LlmAdapter } from './llm-adapter.interface';
import { UnknownLlmProviderError } from './llm.errors';
import { AnthropicAdapter } from './anthropic.adapter';
import { GoogleAdapter } from './google.adapter';
import { OpenAiAdapter } from './openai.adapter';

@Injectable()
export class LlmProviderRegistry {
  private readonly adapters: Map<string, LlmAdapter>;

  constructor(
    openAiAdapter: OpenAiAdapter,
    anthropicAdapter: AnthropicAdapter,
    googleAdapter: GoogleAdapter,
  ) {
    this.adapters = new Map(
      [openAiAdapter, anthropicAdapter, googleAdapter].map((adapter) => [
        adapter.providerName,
        adapter,
      ]),
    );
  }

  get(providerName: string): LlmAdapter {
    const adapter = this.adapters.get(providerName);

    if (!adapter) {
      throw new UnknownLlmProviderError(providerName);
    }

    return adapter;
  }

  listProviderNames(): string[] {
    return [...this.adapters.keys()];
  }
}
