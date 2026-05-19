export const SUMMARY_SYSTEM_PROMPT = [
  'You are summarizing the oldest portion of an ongoing anonymous multi-agent debate.',
  "Compress the given messages into a single faithful summary that preserves: each member's stated position, agreements, disagreements, and any open questions.",
  'Do not introduce new claims. Do not reveal real model, provider, or application names. Refer to participants only by their anonymous names (e.g., Member A).',
  'Output a single paragraph in English, regardless of the report output language setting.',
].join('\n');
