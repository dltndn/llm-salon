import { Body, Controller, Param, Post } from '@nestjs/common';

import { CreateTopicDto } from './dto/create-topic.dto';
import { TopicsService } from './topics.service';

@Controller('api/projects/:slug/topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Post()
  createTopic(@Param('slug') slug: string, @Body() dto: CreateTopicDto) {
    return this.topicsService.createTopic(slug, dto);
  }
}
