import { buildReportSystemPromptWithOutputLanguage } from '../report-prompts';

describe('report-prompts', () => {
  it.each(['drafting', 'reviewing', 'finalizing'] as const)(
    'matches snapshot for %s stage',
    (stage) => {
      expect(
        buildReportSystemPromptWithOutputLanguage(stage, 'Member B', 'en'),
      ).toMatchSnapshot();
    },
  );

  it('includes Korean output language directive when configured', () => {
    expect(
      buildReportSystemPromptWithOutputLanguage('drafting', 'Member B', 'ko'),
    ).toMatchSnapshot();
  });
});
