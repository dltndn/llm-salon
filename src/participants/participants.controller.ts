import { Body, Controller, Delete, Param, Post } from '@nestjs/common';

import { Audience, AudienceRoute, RequestAudience } from '../common/audience';
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

  @AudienceRoute('human')
  @Delete(':participantId')
  removeParticipant(
    @Param('slug') slug: string,
    @Param('participantId') participantId: string,
  ) {
    return this.participantsService.removeParticipant(slug, participantId);
  }
}
