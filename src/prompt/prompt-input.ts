import { AnonymousDto } from '../common/dto';
import { assertAnonymousPayload } from '../common/interceptors/anonymous-guard.interceptor';

export type PromptBuilderInput<T extends AnonymousDto = AnonymousDto> = T;

const HUMAN_IDENTIFIER_PATTERN =
  /\b(?:openai|anthropic|google|gemini|claude|gpt(?:[-_\s]?\d|[-_\s]?o)|codex)\b/i;

export function createPromptBuilderInput<T extends AnonymousDto>(
  input: T,
): PromptBuilderInput<T> {
  assertAnonymousPayload(input);
  assertNoHumanIdentifierText(input);
  return input;
}

export function assertNoHumanIdentifierText(payload: unknown): void {
  const path = findHumanIdentifierText(payload);

  if (path) {
    throw new Error(`Prompt input contains human identifier text: ${path}`);
  }
}

function findHumanIdentifierText(
  value: unknown,
  path = '$',
  seen = new WeakSet<object>(),
): string | null {
  if (typeof value === 'string') {
    return HUMAN_IDENTIFIER_PATTERN.test(value) ? path : null;
  }

  if (value === null || typeof value !== 'object') {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (value instanceof Date) {
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = findHumanIdentifierText(
        value[index],
        `${path}[${index}]`,
        seen,
      );

      if (result) {
        return result;
      }
    }

    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    const result = findHumanIdentifierText(child, `${path}.${key}`, seen);

    if (result) {
      return result;
    }
  }

  return null;
}
