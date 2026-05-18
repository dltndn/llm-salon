import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { EjsRendererService } from './ejs-renderer.service';
import { ViewsService } from './views.service';

type TypedResponse = {
  type: (contentType: string) => void;
};

@Controller()
export class ViewsController {
  private readonly publicPath = join(__dirname, '..', '..', 'public');

  constructor(
    private readonly views: ViewsService,
    private readonly renderer: EjsRendererService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async projectsIndex(): Promise<string> {
    return this.renderer.renderView(
      'projects-index',
      await this.views.getProjectList(),
    );
  }

  @Get('projects/:slug')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async projectDashboard(
    @Param('slug') slug: string,
    @Query('topic') topicId?: string,
  ): Promise<string> {
    return this.renderer.renderView(
      'project-dashboard',
      await this.views.getProjectDashboard(slug, topicId),
    );
  }

  @Get('public/:fileName')
  async publicAsset(
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) response: TypedResponse,
  ): Promise<StreamableFile> {
    const contentType = this.contentTypeFor(fileName);

    if (!contentType) {
      throw new NotFoundException(`Asset not found: ${fileName}`);
    }

    response.type(contentType);
    return new StreamableFile(await readFile(join(this.publicPath, fileName)));
  }

  private contentTypeFor(fileName: string): string | null {
    if (fileName === 'styles.css') {
      return 'text/css; charset=utf-8';
    }

    if (fileName === 'dashboard.js') {
      return 'text/javascript; charset=utf-8';
    }

    return null;
  }
}
