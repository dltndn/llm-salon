import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { normalizeAudience } from '../common/audience';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';

@Controller('api/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  createProject(@Body() dto: CreateProjectDto) {
    return this.projectsService.createProject(dto);
  }

  @Get()
  listProjects(@Query('audience') audience?: string) {
    return this.projectsService.listProjects(normalizeAudience(audience));
  }

  @Get(':slug')
  getProject(@Param('slug') slug: string, @Query('audience') audience?: string) {
    return this.projectsService.getProjectBySlug(
      slug,
      normalizeAudience(audience),
    );
  }
}
