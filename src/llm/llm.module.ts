import { Module } from '@nestjs/common';

import { OpenAiAdapter } from './openai.adapter';

@Module({
  providers: [OpenAiAdapter],
  exports: [OpenAiAdapter],
})
export class LlmModule {}
