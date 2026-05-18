import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { Audience, RequestAudience } from '../common/audience';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';

@Controller('api/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  createProject(
    @Body() dto: CreateProjectDto,
    @RequestAudience() audience: Audience,
  ) {
    return this.projectsService.createProject(dto, audience);
  }

  @Get()
  listProjects(@RequestAudience() audience: Audience) {
    return this.projectsService.listProjects(audience);
  }

  @Get(':slug')
  getProject(@Param('slug') slug: string, @RequestAudience() audience: Audience) {
    return this.projectsService.getProjectBySlug(slug, audience);
  }
}
