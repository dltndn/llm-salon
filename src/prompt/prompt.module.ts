import { Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module';
import { DocumentsModule } from '../documents/documents.module';
import { LlmModule } from '../llm/llm.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ContextBuilderService } from './context-builder.service';
import { ContextController } from './context.controller';
import { ContextPayloadService } from './context-payload.service';
import { SummarizerService } from './summarizer.service';

@Module({
  imports: [AppConfigModule, DocumentsModule, LlmModule, PrismaModule],
  controllers: [ContextController],
  providers: [ContextBuilderService, ContextPayloadService, SummarizerService],
  exports: [ContextBuilderService, ContextPayloadService, SummarizerService],
})
export class PromptModule {}
