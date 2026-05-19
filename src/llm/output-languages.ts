import type { LlmSalonOutputLanguage } from '../config/env.schema';

export const OUTPUT_LANGUAGE_NAMES: Record<LlmSalonOutputLanguage, string> = {
  en: 'English',
  ko: 'Korean',
  ja: 'Japanese',
  zh: 'Chinese (Simplified)',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

export function getOutputLanguageName(
  code: LlmSalonOutputLanguage,
): string {
  return OUTPUT_LANGUAGE_NAMES[code];
}

export function appendReportOutputLanguageDirective(
  systemPrompt: string,
  languageCode: LlmSalonOutputLanguage,
): string {
  const languageName = getOutputLanguageName(languageCode);

  return [
    systemPrompt,
    '',
    `Write the entire report (including section headings, bullet points, and summaries) in ${languageName}.`,
    'Preserve quoted code, identifiers, and technical terms in their original form when no natural translation exists.',
  ].join('\n');
}
