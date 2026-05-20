const MASKED_VALUE = '[redacted]';

const SENSITIVE_FIELD_NAMES = new Set([
  'apikey',
  'api_key',
  'authorization',
  'openai_api_key',
  'anthropic_api_key',
  'google_api_key',
]);

const SECRET_ENV_KEY_PATTERN = /(?:^|_)(?:API_KEY|AUTHORIZATION|TOKEN|SECRET)$/iu;
const INLINE_SECRET_PATTERN =
  /\b(api[_-]?key|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY)\b(\s*[:=]\s*)(["']?)([^"',\s}]+)/giu;
const AUTHORIZATION_PATTERN =
  /\b(authorization\s*[:=]\s*)(?:(bearer)\s+)?([^\s"',}]+)/giu;

export function maskLogMessage(
  message: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return maskSecretValues(maskInlineSecretAssignments(message), env);
}

export function maskLogValue(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): unknown {
  return maskValue(value, env, new WeakSet<object>());
}

function maskValue(
  value: unknown,
  env: NodeJS.ProcessEnv,
  seen: WeakSet<object>,
): unknown {
  if (typeof value === 'string') {
    return maskLogMessage(value, env);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => maskValue(item, env, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      isSensitiveFieldName(key)
        ? MASKED_VALUE
        : maskValue(child, env, seen),
    ]),
  );
}

function maskInlineSecretAssignments(message: string): string {
  return message
    .replace(INLINE_SECRET_PATTERN, `$1$2$3${MASKED_VALUE}`)
    .replace(AUTHORIZATION_PATTERN, (_, prefix: string, scheme?: string) =>
      `${prefix}${scheme ? `${scheme} ` : ''}${MASKED_VALUE}`,
    );
}

function maskSecretValues(message: string, env: NodeJS.ProcessEnv): string {
  return Object.entries(env)
    .filter(([key, value]) => SECRET_ENV_KEY_PATTERN.test(key) && isMaskableSecret(value))
    .reduce(
      (masked, [, value]) => masked.split(value as string).join(MASKED_VALUE),
      message,
    );
}

function isSensitiveFieldName(fieldName: string): boolean {
  return SENSITIVE_FIELD_NAMES.has(fieldName.toLowerCase());
}

function isMaskableSecret(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length >= 4;
}
