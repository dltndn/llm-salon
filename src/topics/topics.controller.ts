import { Body, Controller, Delete, Param, Post } from '@nestjs/common';

import { Audience, AudienceRoute, RequestAudience } from '../common/audience';
import { CreateTopicDto } from './dto/create-topic.dto';
import { TopicsService } from './topics.service';

@Controller('api/projects/:slug/topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Post()
  createTopic(
    @Param('slug') slug: string,
    @Body() dto: CreateTopicDto,
    @RequestAudience() audience: Audience,
  ) {
    return this.topicsService.createTopic(slug, dto, audience);
  }

  @AudienceRoute('human')
  @Delete(':topicId')
  hideTopic(@Param('slug') slug: string, @Param('topicId') topicId: string) {
    return this.topicsService.hideTopic(slug, topicId);
  }
}
