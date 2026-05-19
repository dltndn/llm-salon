import {
  appendReportOutputLanguageDirective,
  getOutputLanguageName,
} from '../output-languages';

describe('output-languages', () => {
  it('maps supported language codes to prompt language names', () => {
    expect(getOutputLanguageName('en')).toBe('English');
    expect(getOutputLanguageName('ko')).toBe('Korean');
    expect(getOutputLanguageName('ja')).toBe('Japanese');
  });

  it('appends the report output language directive', () => {
    const prompt = appendReportOutputLanguageDirective(
      'Base reporter prompt.',
      'ko',
    );

    expect(prompt).toContain('Base reporter prompt.');
    expect(prompt).toContain('Write the entire report');
    expect(prompt).toContain('Korean');
    expect(prompt).toContain('Preserve quoted code');
  });
});
