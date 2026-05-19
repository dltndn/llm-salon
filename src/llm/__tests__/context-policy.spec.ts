import {
  calculateContextTokenBudget,
  CONTEXT_PROFILE_POLICIES,
  getContextProfilePolicy,
  resolveContextProfile,
} from '../context-policy';
import { getModelMetadata } from '../models';

const originalContextProfile = process.env.LLM_SALON_CONTEXT_PROFILE;

describe('context policy', () => {
  afterEach(() => {
    if (originalContextProfile === undefined) {
      delete process.env.LLM_SALON_CONTEXT_PROFILE;
    } else {
      process.env.LLM_SALON_CONTEXT_PROFILE = originalContextProfile;
    }
  });

  it('exposes the low profile limits', () => {
    expect(CONTEXT_PROFILE_POLICIES.low).toEqual({
      profile: 'low',
      modelWindowUsageRatio: 0.25,
      documentInlineLimitBytesPerFile: 64 * 1024,
      documentInlineLimitBytesPerProject: 256 * 1024,
      previousMessageRetentionRatio: 0.3,
    });
  });

  it('exposes the medium profile limits', () => {
    expect(CONTEXT_PROFILE_POLICIES.medium).toEqual({
      profile: 'medium',
      modelWindowUsageRatio: 0.5,
      documentInlineLimitBytesPerFile: 128 * 1024,
      documentInlineLimitBytesPerProject: 512 * 1024,
      previousMessageRetentionRatio: 0.6,
    });
  });

  it('exposes the high profile limits', () => {
    expect(CONTEXT_PROFILE_POLICIES.high).toEqual({
      profile: 'high',
      modelWindowUsageRatio: 0.8,
      documentInlineLimitBytesPerFile: 256 * 1024,
      documentInlineLimitBytesPerProject: 1024 * 1024,
      previousMessageRetentionRatio: 0.9,
    });
  });

  it.each([
    ['low', 32_000],
    ['medium', 64_000],
    ['high', 102_400],
  ] as const)('calculates %s profile token budget', (profile, expectedCap) => {
    const model = getModelMetadata('gpt-4o-mini');

    expect(model).toBeDefined();
    expect(calculateContextTokenBudget(model!, profile)).toEqual({
      profile,
      modelName: 'gpt-4o-mini',
      contextWindowTokens: 128_000,
      maxContextTokens: expectedCap,
      recommendedMaxOutputTokens: 16_384,
      maxInputTokens: expectedCap,
    });
  });

  it.each([
    ['gpt-5.5', 1_000_000, 128_000],
    ['gpt-5.4', 1_000_000, 128_000],
    ['gpt-5.4-mini', 400_000, 128_000],
  ] as const)(
    'exposes OpenAI %s model metadata',
    (modelName, contextWindowTokens, recommendedMaxOutputTokens) => {
      expect(getModelMetadata(modelName)).toEqual({
        providerName: 'openai',
        modelName,
        contextWindowTokens,
        recommendedMaxOutputTokens,
      });
    },
  );

  it.each([
    ['claude-sonnet-4-5', 'anthropic', 200_000, 64_000],
    ['claude-haiku-4-5', 'anthropic', 200_000, 64_000],
    ['gemini-3-pro-preview', 'google', 1_048_576, 65_536],
    ['gemini-2.5-pro', 'google', 1_048_576, 65_536],
    ['gemini-2.0-flash', 'google', 1_048_576, 8_192],
  ] as const)(
    'exposes %s provider model metadata',
    (
      modelName,
      providerName,
      contextWindowTokens,
      recommendedMaxOutputTokens,
    ) => {
      expect(getModelMetadata(modelName)).toEqual({
        providerName,
        modelName,
        contextWindowTokens,
        recommendedMaxOutputTokens,
      });
    },
  );

  it.each([
    ['claude-sonnet-4-5', 'low', 50_000, 50_000],
    ['claude-sonnet-4-5', 'medium', 100_000, 64_000],
    ['claude-sonnet-4-5', 'high', 160_000, 64_000],
    ['claude-haiku-4-5', 'low', 50_000, 50_000],
    ['claude-haiku-4-5', 'medium', 100_000, 64_000],
    ['claude-haiku-4-5', 'high', 160_000, 64_000],
    ['gemini-3-pro-preview', 'low', 262_144, 65_536],
    ['gemini-3-pro-preview', 'medium', 524_288, 65_536],
    ['gemini-3-pro-preview', 'high', 838_860, 65_536],
    ['gemini-2.5-pro', 'low', 262_144, 65_536],
    ['gemini-2.5-pro', 'medium', 524_288, 65_536],
    ['gemini-2.5-pro', 'high', 838_860, 65_536],
    ['gemini-2.0-flash', 'low', 262_144, 8_192],
    ['gemini-2.0-flash', 'medium', 524_288, 8_192],
    ['gemini-2.0-flash', 'high', 838_860, 8_192],
  ] as const)(
    'calculates %s %s profile token budget',
    (modelName, profile, expectedCap, expectedOutput) => {
      const model = getModelMetadata(modelName);

      expect(model).toBeDefined();
      expect(calculateContextTokenBudget(model!, profile)).toEqual({
        profile,
        modelName,
        contextWindowTokens: model!.contextWindowTokens,
        maxContextTokens: expectedCap,
        recommendedMaxOutputTokens: expectedOutput,
        maxInputTokens: expectedCap,
      });
    },
  );

  it('does not subtract recommended output tokens from the input context budget', () => {
    const model = getModelMetadata('gpt-4');

    expect(model).toBeDefined();
    expect(calculateContextTokenBudget(model!, 'medium')).toEqual({
      profile: 'medium',
      modelName: 'gpt-4',
      contextWindowTokens: 8_192,
      maxContextTokens: 4_096,
      recommendedMaxOutputTokens: 4_096,
      maxInputTokens: 4_096,
    });
  });

  it('caps recommended output tokens at the active context budget', () => {
    const model = {
      providerName: 'openai',
      modelName: 'tiny',
      contextWindowTokens: 1_000,
      recommendedMaxOutputTokens: 2_000,
    };

    expect(calculateContextTokenBudget(model, 'low')).toEqual({
      profile: 'low',
      modelName: 'tiny',
      contextWindowTokens: 1_000,
      maxContextTokens: 250,
      recommendedMaxOutputTokens: 250,
      maxInputTokens: 250,
    });
  });

  it('falls back to medium when the profile is missing or invalid', () => {
    delete process.env.LLM_SALON_CONTEXT_PROFILE;
    expect(resolveContextProfile()).toBe('medium');

    process.env.LLM_SALON_CONTEXT_PROFILE = 'ultra';
    expect(resolveContextProfile()).toBe('medium');
    expect(getContextProfilePolicy().profile).toBe('medium');
  });

  it('uses valid env profile values', () => {
    process.env.LLM_SALON_CONTEXT_PROFILE = 'high';

    expect(resolveContextProfile()).toBe('high');
    expect(getContextProfilePolicy().profile).toBe('high');
  });
});
