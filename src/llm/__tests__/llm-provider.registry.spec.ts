import type { LlmAdapter } from '../llm-adapter.interface';
import { UnknownLlmProviderError } from '../llm.errors';
import { LlmProviderRegistry } from '../llm-provider.registry';
import type { AnthropicAdapter } from '../anthropic.adapter';
import type { GoogleAdapter } from '../google.adapter';
import type { OpenAiAdapter } from '../openai.adapter';

function adapter(providerName: string): LlmAdapter {
  return {
    providerName,
    generate: jest.fn(),
  };
}

describe('LlmProviderRegistry', () => {
  it('resolves adapters by providerName', () => {
    const openai = adapter('openai') as OpenAiAdapter;
    const anthropic = adapter('anthropic') as AnthropicAdapter;
    const google = adapter('google') as GoogleAdapter;
    const registry = new LlmProviderRegistry(openai, anthropic, google);

    expect(registry.get('openai')).toBe(openai);
    expect(registry.get('anthropic')).toBe(anthropic);
    expect(registry.get('google')).toBe(google);
    expect(registry.listProviderNames()).toEqual([
      'openai',
      'anthropic',
      'google',
    ]);
  });

  it('throws for unknown provider names', () => {
    const registry = new LlmProviderRegistry(
      adapter('openai') as OpenAiAdapter,
      adapter('anthropic') as AnthropicAdapter,
      adapter('google') as GoogleAdapter,
    );

    expect(() => registry.get('unknown')).toThrow(UnknownLlmProviderError);
  });
});
