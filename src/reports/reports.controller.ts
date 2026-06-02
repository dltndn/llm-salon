import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { Audience, RequestAudience } from '../common/audience';
import { SubmitReportArtifactDto } from './dto/submit-report-artifact.dto';
import { ReportsService } from './reports.service';

@Controller('api/projects/:slug/topics/:topicId/report')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  getReportStatus(
    @Param('slug') slug: string,
    @Param('topicId') topicId: string,
    @RequestAudience() audience: Audience,
  ) {
    return this.reportsService.getReportStatus(slug, topicId, audience);
  }

  @Post('draft')
  submitReportDraft(
    @Param('slug') slug: string,
    @Param('topicId') topicId: string,
    @Body() dto: SubmitReportArtifactDto,
  ) {
    return this.reportsService.submitReportDraft(slug, topicId, dto);
  }

  @Post('final')
  submitReportFinal(
    @Param('slug') slug: string,
    @Param('topicId') topicId: string,
    @Body() dto: SubmitReportArtifactDto,
  ) {
    return this.reportsService.submitReportFinal(slug, topicId, dto);
  }
}
