import { Controller, Get, Param } from '@nestjs/common';

import { Audience, RequestAudience } from '../common/audience';
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
}
