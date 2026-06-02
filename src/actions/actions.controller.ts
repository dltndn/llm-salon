import { Controller, Get, Param, Query } from '@nestjs/common';

import { Audience, RequestAudience } from '../common/audience';
import { ActionsService } from './actions.service';

@Controller('api/projects/:slug/topics/:topicId/action')
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Get('wait')
  waitForAction(
    @Param('slug') slug: string,
    @Param('topicId') topicId: string,
    @Query('participantId') participantId: string,
    @Query('afterTopicVersion') afterTopicVersion?: string,
    @Query('timeoutMs') timeoutMs?: string,
    @RequestAudience() audience?: Audience,
  ) {
    return this.actionsService.waitForAction(
      slug,
      topicId,
      {
        participantId,
        afterTopicVersion,
        timeoutMs,
      },
      audience,
    );
  }
}
