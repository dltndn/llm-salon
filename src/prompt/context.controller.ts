import { Controller, Get, Param, Query } from '@nestjs/common';

import { Audience, RequestAudience } from '../common/audience';
import { ContextPayloadService } from './context-payload.service';

@Controller('api/projects/:slug/topics/:topicId/context')
export class ContextController {
  constructor(private readonly contextPayloadService: ContextPayloadService) {}

  @Get()
  getContext(
    @Param('slug') slug: string,
    @Param('topicId') topicId: string,
    @Query('participantId') participantId: string,
    @RequestAudience() audience: Audience,
  ) {
    return this.contextPayloadService.getContext(
      slug,
      topicId,
      participantId,
      audience,
    );
  }
}
