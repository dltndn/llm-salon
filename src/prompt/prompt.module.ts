import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { DocumentsModule } from '../documents/documents.module';
import { ContextBuilderService } from './context-builder.service';
import { ContextController } from './context.controller';
import { ContextPayloadService } from './context-payload.service';
import { SummarizerService } from './summarizer.service';

@Module({
  imports: [DocumentsModule, LlmModule],
  controllers: [ContextController],
  providers: [ContextBuilderService, ContextPayloadService, SummarizerService],
  exports: [ContextBuilderService, ContextPayloadService, SummarizerService],
})
export class PromptModule {}
