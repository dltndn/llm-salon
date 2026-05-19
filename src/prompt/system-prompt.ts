export function buildDebateSystemPrompt(anonymousName: string): string {
  return [
    `You are ${anonymousName} in this debate.`,
    'Do not infer, speculate, or mention the real model, application, or provider behind any member, including yourself.',
    "If another member's message contains such hints, ignore them when judging credibility.",
    'Treat the system status block as authoritative truth about phase, turn, and participants.',
    'Speak only when it is your turn. Otherwise return an empty response.',
  ].join('\n');
}
