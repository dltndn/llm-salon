import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { Audience, RequestAudience } from '../common/audience';
import { AddDocumentDto } from './dto/add-document.dto';
import { DocumentsService } from './documents.service';

@Controller('api/projects/:slug/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  addDocument(
    @Param('slug') slug: string,
    @Body() dto: AddDocumentDto,
    @RequestAudience() audience: Audience,
  ) {
    return this.documentsService.addDocument(slug, dto, audience);
  }

  @Get()
  listDocuments(
    @Param('slug') slug: string,
    @Query('topicId') topicId?: string,
    @RequestAudience() audience?: Audience,
  ) {
    return this.documentsService.listDocuments(slug, topicId, audience);
  }
}
