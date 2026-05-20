import { maskLogMessage, maskLogValue } from './masking.interceptor';

describe('masking interceptor', () => {
  const env = {
    OPENAI_API_KEY: 'sk-openai-secret',
    ANTHROPIC_API_KEY: 'anthropic-secret',
    GOOGLE_API_KEY: 'google-secret',
  };

  it('masks known provider key values in log messages', () => {
    expect(
      maskLogMessage(
        'Provider failed with sk-openai-secret and google-secret',
        env,
      ),
    ).toBe('Provider failed with [redacted] and [redacted]');
  });

  it('masks inline API key and authorization assignments', () => {
    expect(
      maskLogMessage(
        'apiKey=abc123 Authorization: Bearer token-value OPENAI_API_KEY=raw',
        env,
      ),
    ).toBe(
      'apiKey=[redacted] Authorization: Bearer [redacted] OPENAI_API_KEY=[redacted]',
    );
  });

  it('masks sensitive fields in nested payloads without dropping structure', () => {
    expect(
      maskLogValue(
        {
          apiKey: 'direct-secret',
          nested: {
            Authorization: 'Bearer nested-secret',
            content: 'safe text with anthropic-secret',
          },
          list: [{ GOOGLE_API_KEY: 'field-secret' }],
        },
        env,
      ),
    ).toEqual({
      apiKey: '[redacted]',
      nested: {
        Authorization: '[redacted]',
        content: 'safe text with [redacted]',
      },
      list: [{ GOOGLE_API_KEY: '[redacted]' }],
    });
  });
});
