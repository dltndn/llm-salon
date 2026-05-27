import { Controller, Get, Param, Query } from '@nestjs/common';

import { Audience, RequestAudience } from '../common/audience';
import { TurnsService } from './turns.service';

@Controller('api/projects/:slug/topics/:topicId/turn')
export class TurnsController {
  constructor(private readonly turnsService: TurnsService) {}

  @Get()
  getTurn(
    @Param('slug') slug: string,
    @Param('topicId') topicId: string,
    @Query('participantId') participantId?: string,
    @RequestAudience() audience?: Audience,
  ) {
    return this.turnsService.getTurn(slug, topicId, participantId, audience);
  }

  @Get('wait')
  waitForTurn(
    @Param('slug') slug: string,
    @Param('topicId') topicId: string,
    @Query('participantId') participantId: string,
    @Query('afterTopicVersion') afterTopicVersion?: string,
    @Query('timeoutMs') timeoutMs?: string,
    @RequestAudience() audience?: Audience,
  ) {
    return this.turnsService.waitForTurn(
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
