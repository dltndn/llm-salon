import {
  DEFAULT_LLM_SALON_CONTEXT_PROFILE,
  DEFAULT_LLM_SALON_OUTPUT_LANGUAGE,
  DEFAULT_LLM_SALON_PORT,
  validateEnv,
} from '../env.schema';

describe('validateEnv', () => {
  it('falls back to defaults for invalid whitelisted values and warns', () => {
    const logger = {
      warn: jest.fn(),
    };

    const normalizedEnv = validateEnv(
      {
        LLM_SALON_PORT: 'invalid',
        LLM_SALON_CONTEXT_PROFILE: 'ultra',
        LLM_SALON_OUTPUT_LANGUAGE: 'it',
      },
      logger,
    );

    expect(normalizedEnv.LLM_SALON_PORT).toBe(`${DEFAULT_LLM_SALON_PORT}`);
    expect(normalizedEnv.LLM_SALON_CONTEXT_PROFILE).toBe(
      DEFAULT_LLM_SALON_CONTEXT_PROFILE,
    );
    expect(normalizedEnv.LLM_SALON_OUTPUT_LANGUAGE).toBe(
      DEFAULT_LLM_SALON_OUTPUT_LANGUAGE,
    );
    expect(logger.warn).toHaveBeenCalledTimes(3);
  });

  it('rejects partial and decimal port values', () => {
    const logger = {
      warn: jest.fn(),
    };

    const partialPortEnv = validateEnv(
      {
        LLM_SALON_PORT: '4477abc',
      },
      logger,
    );

    const decimalPortEnv = validateEnv(
      {
        LLM_SALON_PORT: '1.5',
      },
      logger,
    );

    expect(partialPortEnv.LLM_SALON_PORT).toBe(`${DEFAULT_LLM_SALON_PORT}`);
    expect(decimalPortEnv.LLM_SALON_PORT).toBe(`${DEFAULT_LLM_SALON_PORT}`);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
