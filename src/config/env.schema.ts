import { Logger } from '@nestjs/common';

export const DEFAULT_LLM_SALON_PORT = 4477;
export const DEFAULT_LLM_SALON_CONTEXT_PROFILE = 'medium';
export const DEFAULT_LLM_SALON_OUTPUT_LANGUAGE = 'en';

export const LLM_SALON_CONTEXT_PROFILES = ['low', 'medium', 'high'] as const;
export const LLM_SALON_OUTPUT_LANGUAGES = [
  'en',
  'ko',
  'ja',
  'zh',
  'es',
  'fr',
  'de',
] as const;

export type LlmSalonContextProfile =
  (typeof LLM_SALON_CONTEXT_PROFILES)[number];
export type LlmSalonOutputLanguage =
  (typeof LLM_SALON_OUTPUT_LANGUAGES)[number];

export type EnvWarningLogger = Pick<Logger, 'warn'>;

const envLogger = new Logger('EnvSchema');

function readStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isValidPort(value: string): boolean {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    return false;
  }

  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function normalizePort(
  value: unknown,
  logger: EnvWarningLogger,
): `${number}` {
  const stringValue = readStringValue(value);

  if (stringValue === undefined || stringValue === '') {
    return `${DEFAULT_LLM_SALON_PORT}`;
  }

  if (isValidPort(stringValue)) {
    return `${Number(stringValue)}`;
  }

  logger.warn(
    `Invalid LLM_SALON_PORT "${stringValue}". Falling back to ${DEFAULT_LLM_SALON_PORT}.`,
  );

  return `${DEFAULT_LLM_SALON_PORT}`;
}

function normalizeEnumValue<T extends readonly string[]>(
  envName: string,
  value: unknown,
  allowedValues: T,
  fallbackValue: T[number],
  logger: EnvWarningLogger,
): T[number] {
  const stringValue = readStringValue(value);

  if (stringValue === undefined || stringValue === '') {
    return fallbackValue;
  }

  if ((allowedValues as readonly string[]).includes(stringValue)) {
    return stringValue as T[number];
  }

  logger.warn(
    `Invalid ${envName} "${stringValue}". Falling back to ${fallbackValue}.`,
  );

  return fallbackValue;
}

export function normalizeContextProfile(
  value: unknown,
  logger: EnvWarningLogger = envLogger,
): LlmSalonContextProfile {
  return normalizeEnumValue(
    'LLM_SALON_CONTEXT_PROFILE',
    value,
    LLM_SALON_CONTEXT_PROFILES,
    DEFAULT_LLM_SALON_CONTEXT_PROFILE,
    logger,
  );
}

export function validateEnv(
  input: Record<string, unknown>,
  logger: EnvWarningLogger = envLogger,
): Record<string, unknown> {
  return {
    ...input,
    LLM_SALON_PORT: normalizePort(input.LLM_SALON_PORT, logger),
    LLM_SALON_CONTEXT_PROFILE: normalizeContextProfile(
      input.LLM_SALON_CONTEXT_PROFILE,
      logger,
    ),
    LLM_SALON_OUTPUT_LANGUAGE: normalizeEnumValue(
      'LLM_SALON_OUTPUT_LANGUAGE',
      input.LLM_SALON_OUTPUT_LANGUAGE,
      LLM_SALON_OUTPUT_LANGUAGES,
      DEFAULT_LLM_SALON_OUTPUT_LANGUAGE,
      logger,
    ),
  };
}
