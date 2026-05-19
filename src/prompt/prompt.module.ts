import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { ContextBuilderService } from './context-builder.service';
import { SummarizerService } from './summarizer.service';

@Module({
  imports: [LlmModule],
  providers: [ContextBuilderService, SummarizerService],
  exports: [ContextBuilderService, SummarizerService],
})
export class PromptModule {}
