import { Module } from '@nestjs/common';

import { AnthropicAdapter } from './anthropic.adapter';
import { GoogleAdapter } from './google.adapter';
import { LlmProviderRegistry } from './llm-provider.registry';
import { OpenAiAdapter } from './openai.adapter';

@Module({
  providers: [OpenAiAdapter, AnthropicAdapter, GoogleAdapter, LlmProviderRegistry],
  exports: [OpenAiAdapter, AnthropicAdapter, GoogleAdapter, LlmProviderRegistry],
})
export class LlmModule {}
