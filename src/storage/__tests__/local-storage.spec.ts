import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { LocalStorageService } from '../local-storage.service';
import { PathTraversalError } from '../storage.errors';

describe('LocalStorageService', () => {
  let tempHome: string;
  let service: LocalStorageService;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'llm-salon-storage-'));
    const moduleRef = await Test.createTestingModule({
      providers: [
        LocalStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'LLM_SALON_HOME' ? tempHome : undefined,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(LocalStorageService);
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
  });

  describe('resolveProjectRelativePath', () => {
    it('resolves paths under the project base directory', () => {
      expect(service.resolveProjectRelativePath('demo-project', 'reports')).toBe(
        join(tempHome, 'projects', 'demo-project', 'reports'),
      );
    });

    it.each(['../escape', '..', 'foo/../bar', 'foo/bar', 'foo\\bar'])(
      'rejects traversal in project slug: %s',
      (projectSlug) => {
        expect(() =>
          service.resolveProjectRelativePath(projectSlug, 'reports'),
        ).toThrow(PathTraversalError);
      },
    );

    it.each(['../escape', '..', 'nested/../path'])(
      'rejects traversal in path segments: %s',
      (segment) => {
        expect(() =>
          service.resolveProjectRelativePath('demo-project', segment),
        ).toThrow(PathTraversalError);
      },
    );
  });

  describe('writeReportMarkdown', () => {
    it('writes markdown under projects/<slug>/reports with a timestamp suffix', async () => {
      const topicId = '22222222-2222-4222-8222-cccccccccccc';
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_779_000_000_000);

      const filePath = await service.writeReportMarkdown(
        'demo-project',
        topicId,
        '# Final report',
      );

      nowSpy.mockRestore();

      expect(filePath).toBe(
        join(
          tempHome,
          'projects',
          'demo-project',
          'reports',
          `${topicId}-1779000000000.md`,
        ),
      );
      await expect(readFile(filePath, 'utf8')).resolves.toBe('# Final report');
    });

    it('uses distinct filenames when re-run for the same topic', async () => {
      const topicId = '22222222-2222-4222-8222-cccccccccccc';
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1_779_000_000_000)
        .mockReturnValueOnce(1_779_000_000_001);

      const firstPath = await service.writeReportMarkdown(
        'demo-project',
        topicId,
        'first',
      );
      const secondPath = await service.writeReportMarkdown(
        'demo-project',
        topicId,
        'second',
      );

      nowSpy.mockRestore();

      expect(firstPath).not.toBe(secondPath);
    });

    it('does not overwrite when two writes share the same timestamp', async () => {
      const topicId = '22222222-2222-4222-8222-cccccccccccc';
      const reportsDir = join(
        tempHome,
        'projects',
        'demo-project',
        'reports',
      );
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_779_000_000_000);

      const firstPath = await service.writeReportMarkdown(
        'demo-project',
        topicId,
        'first',
      );
      const secondPath = await service.writeReportMarkdown(
        'demo-project',
        topicId,
        'second',
      );

      nowSpy.mockRestore();

      expect(firstPath).toBe(join(reportsDir, `${topicId}-1779000000000.md`));
      expect(secondPath).toBe(
        join(reportsDir, `${topicId}-1779000000000-1.md`),
      );
      await expect(readFile(firstPath, 'utf8')).resolves.toBe('first');
      await expect(readFile(secondPath, 'utf8')).resolves.toBe('second');
    });

    it('rejects traversal in project slug when writing', async () => {
      await expect(
        service.writeReportMarkdown('../escape', 'topic-id', '# report'),
      ).rejects.toThrow(PathTraversalError);
    });

    it.each(['../escape', 'nested/topic', 'topic\\id'])(
      'rejects traversal in topicId: %s',
      async (topicId) => {
        await expect(
          service.writeReportMarkdown('demo-project', topicId, '# report'),
        ).rejects.toThrow(PathTraversalError);
      },
    );
  });
});
