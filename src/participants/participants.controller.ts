import { Body, Controller, Param, Post, Query } from '@nestjs/common';

import { normalizeAudience } from '../common/audience';
import { RegisterParticipantDto } from './dto/register-participant.dto';
import { ParticipantsService } from './participants.service';

@Controller('api/projects/:slug/participants')
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) {}

  @Post()
  registerParticipant(
    @Param('slug') slug: string,
    @Body() dto: RegisterParticipantDto,
    @Query('audience') audience?: string,
  ) {
    return this.participantsService.registerParticipant(
      slug,
      dto,
      normalizeAudience(audience),
    );
  }
}
