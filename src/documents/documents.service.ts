import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Audience } from '../common/audience';
import { PrismaService } from '../prisma/prisma.service';
import { assertDocumentWithinProfileLimit } from './document-size-policy';
import { AddDocumentDto } from './dto/add-document.dto';
import { serializeDocument, serializeHumanDocument } from './document.presenter';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async addDocument(
    projectSlug: string,
    dto: AddDocumentDto,
    audience: Audience = 'human',
  ) {
    this.assertInlineText(dto);

    const project = await this.prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectSlug}`);
    }

    if (dto.topicId) {
      const topic = await this.prisma.topic.findFirst({
        where: { id: dto.topicId, projectId: project.id },
        select: { id: true },
      });

      if (!topic) {
        throw new NotFoundException(`Topic not found: ${dto.topicId}`);
      }
    }

    const contentBytes = Buffer.byteLength(dto.content, 'utf8');
    assertDocumentWithinProfileLimit({ sizeBytes: contentBytes });

    const contentHash = createHash('sha256').update(dto.content).digest('hex');
    const fileName = basename(dto.fileName);
    const filePath = join(
      this.config.get<string>('LLM_SALON_HOME', process.env.LLM_SALON_HOME ?? '.'),
      'documents',
      project.id,
      `${contentHash}-${fileName}`,
    );
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, dto.content, 'utf8');

    const document = await this.prisma.document.create({
      data: {
        projectId: project.id,
        topicId: dto.topicId ?? null,
        fileName,
        filePath,
        mimeType: 'text/plain; charset=utf-8',
        sizeBytes: contentBytes,
        contentHash,
      },
    });

    return audience === 'anonymous'
      ? serializeDocument(document)
      : serializeHumanDocument(document);
  }

  async listDocuments(
    projectSlug: string,
    topicId?: string,
    audience: Audience = 'human',
  ) {
    const project = await this.prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectSlug}`);
    }

    const documents = await this.prisma.document.findMany({
      where: {
        projectId: project.id,
        ...(topicId ? { OR: [{ topicId: null }, { topicId }] } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    return documents.map((document) =>
      audience === 'anonymous'
        ? serializeDocument(document)
        : serializeHumanDocument(document),
    );
  }

  async readDocumentContent(filePath: string): Promise<string> {
    return readFile(filePath, 'utf8');
  }

  private assertInlineText(dto: AddDocumentDto): void {
    if (dto.fileName !== basename(dto.fileName)) {
      throw new BadRequestException('fileName must not contain a path.');
    }

    if (dto.content.includes('\0')) {
      throw new BadRequestException('Document content must be UTF-8 text.');
    }

    if (isBareFilePath(dto.content)) {
      throw new BadRequestException('Document content must be inline text, not a file path.');
    }
  }
}

function isBareFilePath(content: string): boolean {
  const trimmed = content.trim();

  return (
    !/\s/u.test(trimmed) &&
    /^(?:file:|~[/\\]|[/\\]|\.\.?[/\\]|[A-Za-z]:\\)/u.test(trimmed)
  );
}
