import type { LlmSalonOutputLanguage } from '../config/env.schema';
import { appendReportOutputLanguageDirective } from '../llm/output-languages';

export type ReportPromptStage = 'drafting' | 'reviewing' | 'finalizing';

const REPORT_PROMPT_INTRO =
  'Do not infer, speculate, or mention the real model, application, or provider behind any member, including yourself.';

export function buildReportSystemPrompt(
  stage: ReportPromptStage,
  reporterAnonymousName: string,
): string {
  const lines = [
    `You are ${reporterAnonymousName}, the assigned reporter for this debate.`,
    REPORT_PROMPT_INTRO,
  ];

  if (stage === 'drafting') {
    lines.push(
      'Produce a structured draft report in Markdown that synthesizes the debate so far.',
      'Include an executive summary, key positions, areas of agreement and disagreement, and open questions.',
    );
  } else if (stage === 'reviewing') {
    lines.push(
      'Summarize all member feedback on the draft report into concise revision notes for the final report.',
      'Preserve disagreements and actionable suggestions.',
    );
  } else {
    lines.push(
      'Produce the final Markdown report incorporating the draft, revision notes, and debate outcomes.',
      'Include clear sections and a brief metadata appendix listing participant anonymous names only.',
    );
  }

  return lines.join('\n');
}

export function buildReportSystemPromptWithOutputLanguage(
  stage: ReportPromptStage,
  reporterAnonymousName: string,
  outputLanguage: LlmSalonOutputLanguage,
): string {
  return appendReportOutputLanguageDirective(
    buildReportSystemPrompt(stage, reporterAnonymousName),
    outputLanguage,
  );
}

export function buildReportStageInstruction(stage: ReportPromptStage): string {
  if (stage === 'drafting') {
    return '[report task]\nWrite the draft report now.';
  }

  if (stage === 'reviewing') {
    return '[report task]\nWrite revision notes from the feedback now.';
  }

  return '[report task]\nWrite the final report now.';
}
