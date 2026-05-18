import { Body, Controller, Param, Post } from '@nestjs/common';

import { Audience, RequestAudience } from '../common/audience';
import { RegisterParticipantDto } from './dto/register-participant.dto';
import { ParticipantsService } from './participants.service';

@Controller('api/projects/:slug/participants')
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) {}

  @Post()
  registerParticipant(
    @Param('slug') slug: string,
    @Body() dto: RegisterParticipantDto,
    @RequestAudience() audience: Audience,
  ) {
    return this.participantsService.registerParticipant(slug, dto, audience);
  }
}
