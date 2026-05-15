import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';

import { Audience } from '../common/audience';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { serializeProject } from './project.presenter';
import { slugifyProjectName } from './slug';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProject(dto: CreateProjectDto) {
    const baseSlug = slugifyProjectName(dto.slug ?? dto.name);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

      try {
        return serializeProject(
          await this.prisma.project.create({
            data: {
              name: dto.name,
              slug,
              status: ProjectStatus.created,
            },
          }),
          'human',
        );
      } catch (error) {
        if (this.isProjectSlugConflict(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException(`Could not allocate unique slug for ${baseSlug}`);
  }

  async listProjects(audience: Audience) {
    const projects = await this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return projects.map((project) => serializeProject(project, audience));
  }

  async getProjectBySlug(slug: string, audience: Audience) {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      include: {
        participants: {
          orderBy: { joinOrder: 'asc' },
        },
        topics: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${slug}`);
    }

    return serializeProject(project, audience);
  }

  private isProjectSlugConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes('slug')
    );
  }
}
