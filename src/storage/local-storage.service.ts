import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveLlmSalonHome } from '../config/config.paths';
import { PathTraversalError } from './storage.errors';

const MAX_REPORT_FILE_COLLISION_RETRIES = 1_000;

@Injectable()
export class LocalStorageService {
  constructor(private readonly config: ConfigService) {}

  async writeReportMarkdown(
    projectSlug: string,
    topicId: string,
    content: string,
  ): Promise<string> {
    assertSafePathSegment(projectSlug, 'projectSlug');
    assertSafePathSegment(topicId, 'topicId');

    const reportsDirectory = this.resolveProjectRelativePath(
      projectSlug,
      'reports',
    );
    await mkdir(reportsDirectory, { recursive: true });

    const timestamp = Date.now();

    for (let counter = 0; counter <= MAX_REPORT_FILE_COLLISION_RETRIES; counter++) {
      const fileName = buildReportFileName(topicId, timestamp, counter);
      assertSafePathSegment(fileName, 'report file name');

      const filePath = resolve(reportsDirectory, fileName);
      assertWithinBase(reportsDirectory, filePath);

      try {
        await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
        return filePath;
      } catch (error) {
        if (isEexistError(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new Error(
      `Unable to allocate a unique report file name for topic ${topicId}`,
    );
  }

  resolveProjectRelativePath(
    projectSlug: string,
    ...segments: string[]
  ): string {
    assertSafePathSegment(projectSlug, 'projectSlug');
    for (const segment of segments) {
      assertSafePathSegment(segment, 'path segment');
    }

    const projectBase = this.resolveProjectBase(projectSlug);
    const resolvedPath = resolve(projectBase, ...segments);
    assertWithinBase(projectBase, resolvedPath);

    return resolvedPath;
  }

  private resolveProjectBase(projectSlug: string): string {
    return join(this.resolveHome(), 'projects', projectSlug);
  }

  private resolveHome(): string {
    const configuredHome = this.config.get<string>('LLM_SALON_HOME');

    return resolveLlmSalonHome({
      ...process.env,
      ...(configuredHome ? { LLM_SALON_HOME: configuredHome } : {}),
    });
  }
}

function buildReportFileName(
  topicId: string,
  timestamp: number,
  counter: number,
): string {
  if (counter === 0) {
    return `${topicId}-${timestamp}.md`;
  }

  return `${topicId}-${timestamp}-${counter}.md`;
}

function isEexistError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  );
}

function assertSafePathSegment(segment: string, label: string): void {
  if (
    !segment ||
    segment === '.' ||
    segment === '..' ||
    segment.includes('/') ||
    segment.includes('\\') ||
    segment.includes('\0')
  ) {
    throw new PathTraversalError(label);
  }
}

function assertWithinBase(basePath: string, resolvedPath: string): void {
  const normalizedBase = resolve(basePath);
  const normalizedTarget = resolve(resolvedPath);
  const basePrefix = normalizedBase.endsWith(sep)
    ? normalizedBase
    : `${normalizedBase}${sep}`;

  if (
    normalizedTarget !== normalizedBase &&
    !normalizedTarget.startsWith(basePrefix)
  ) {
    throw new PathTraversalError(normalizedTarget);
  }
}
