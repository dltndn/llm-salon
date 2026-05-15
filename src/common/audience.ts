export type Audience = 'human' | 'anonymous';

export function normalizeAudience(value: unknown): Audience {
  return value === 'anonymous' ? 'anonymous' : 'human';
}
