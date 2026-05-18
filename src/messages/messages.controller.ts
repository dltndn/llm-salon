import { Body, Controller, Param, Post } from '@nestjs/common';

import { SubmitMessageDto } from './dto/submit-message.dto';
import { MessagesService } from './messages.service';

@Controller('api/projects/:slug/topics/:topicId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  submitMessage(
    @Param('slug') slug: string,
    @Param('topicId') topicId: string,
    @Body() dto: SubmitMessageDto,
  ) {
    return this.messagesService.submitMessage(slug, topicId, dto);
  }
}
