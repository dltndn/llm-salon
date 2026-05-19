import { Module } from '@nestjs/common';

import { DocumentsModule } from '../documents/documents.module';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportPipelineService } from './report-pipeline.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [PrismaModule, EventsModule, LlmModule, DocumentsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportPipelineService],
  exports: [ReportsService],
})
export class ReportsModule {}
