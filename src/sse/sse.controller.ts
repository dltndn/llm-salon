import { Controller, Headers, MessageEvent, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';

import { SseBroadcasterService } from './sse-broadcaster.service';

@Controller('projects/:slug/events')
export class SseController {
  constructor(private readonly broadcaster: SseBroadcasterService) {}

  @Sse()
  events(
    @Param('slug') slug: string,
    @Headers('last-event-id') lastEventId?: string,
  ): Observable<MessageEvent> {
    return this.broadcaster.streamProject(slug, lastEventId);
  }
}
