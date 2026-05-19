import { Logger } from '@nestjs/common';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from '@anthropic-ai/sdk';
import type { Message } from '@anthropic-ai/sdk/resources/messages';

import { AnthropicAdapter } from '../anthropic.adapter';
import { MissingApiKeyError, ProviderCallFailedError } from '../llm.errors';

type CreateMock = jest.Mock<Promise<Message>, [unknown, unknown?]>;

class TestAnthropicAdapter extends AnthropicAdapter {
  readonly create = jest.fn() as CreateMock;
  readonly sleepCalls: number[] = [];

  protected createClient() {
    return {
      messages: {
        create: this.create,
      },
    };
  }

  protected sleep(ms: number): Promise<void> {
    this.sleepCalls.push(ms);
    return Promise.resolve();
  }
}

const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
let loggerSpy: jest.SpyInstance;

function message(content = 'deterministic response'): Message {
  return {
    content: [{ type: 'text', text: content }],
    usage: {
      input_tokens: 13,
      output_tokens: 8,
    },
  } as Message;
}

describe('AnthropicAdapter', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    if (originalAnthropicApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    }

    jest.clearAllMocks();
    loggerSpy.mockRestore();
  });

  it('returns deterministic content and usage from the mocked SDK', async () => {
    const adapter = new TestAnthropicAdapter();
    adapter.create.mockResolvedValueOnce(message());

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [
          { role: 'system', content: 'context system' },
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
        ],
        modelName: 'claude-test',
        maxTokens: 128,
        temperature: 0.2,
      }),
    ).resolves.toEqual({
      content: 'deterministic response',
      usage: {
        inputTokens: 13,
        outputTokens: 8,
        totalTokens: 21,
      },
    });

    expect(adapter.create).toHaveBeenCalledWith(
      {
        model: 'claude-test',
        system: 'system\n\ncontext system',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
        ],
        max_tokens: 128,
        temperature: 0.2,
        stream: false,
      },
      { timeout: 60_000 },
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      'Anthropic token usage model=claude-test input=13 output=8 total=21',
    );
  });

  it('uses model metadata for default max tokens when maxTokens is omitted', async () => {
    const adapter = new TestAnthropicAdapter();
    adapter.create.mockResolvedValueOnce(message());

    await adapter.generate({
      systemPrompt: 'system',
      contextMessages: [{ role: 'user', content: 'hello' }],
      modelName: 'claude-sonnet-4-5',
    });

    expect(adapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 64_000,
      }),
      { timeout: 60_000 },
    );
  });

  it('throws MissingApiKeyError when ANTHROPIC_API_KEY is absent', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const adapter = new TestAnthropicAdapter();

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'claude-test',
      }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);

    expect(adapter.create).not.toHaveBeenCalled();
  });

  it('retries 5xx failures up to three times before returning content', async () => {
    const adapter = new TestAnthropicAdapter();
    const serverError = APIError.generate(
      500,
      { error: { message: 'server unavailable' } },
      'server unavailable',
      new Headers(),
    );

    adapter.create
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce(message('after retry'));

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'claude-test',
      }),
    ).resolves.toMatchObject({ content: 'after retry' });

    expect(adapter.create).toHaveBeenCalledTimes(4);
    expect(adapter.sleepCalls).toEqual([250, 500, 1_000]);
  });

  it('retries timeout failures', async () => {
    const adapter = new TestAnthropicAdapter();
    const timeoutError = new APIConnectionTimeoutError({
      message: 'request timed out',
    });

    adapter.create
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(message('after timeout'));

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'claude-test',
      }),
    ).resolves.toMatchObject({ content: 'after timeout' });

    expect(adapter.create).toHaveBeenCalledTimes(2);
    expect(adapter.sleepCalls).toEqual([250]);
  });

  it('throws ProviderCallFailedError after the final retry fails', async () => {
    const adapter = new TestAnthropicAdapter();
    const networkError = new APIConnectionError({
      message: 'network unavailable',
    });

    adapter.create.mockRejectedValue(networkError);

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'claude-test',
      }),
    ).rejects.toBeInstanceOf(ProviderCallFailedError);

    expect(adapter.create).toHaveBeenCalledTimes(4);
  });

  it('does not retry 4xx failures', async () => {
    const adapter = new TestAnthropicAdapter();
    const badRequest = APIError.generate(
      400,
      { error: { message: 'bad request' } },
      'bad request',
      new Headers(),
    );

    adapter.create.mockRejectedValueOnce(badRequest);

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'claude-test',
      }),
    ).rejects.toBeInstanceOf(ProviderCallFailedError);

    expect(adapter.create).toHaveBeenCalledTimes(1);
    expect(adapter.sleepCalls).toEqual([]);
  });

  it('masks known secrets from provider error messages', async () => {
    const adapter = new TestAnthropicAdapter();
    adapter.create.mockRejectedValueOnce(
      new Error('Authorization failed for test-anthropic-key'),
    );

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'claude-test',
      }),
    ).rejects.toThrow('Authorization failed for [redacted]');
  });
});

const describeAnthropicE2e =
  process.env.LLM_SALON_E2E === '1' ? describe : describe.skip;

describeAnthropicE2e('AnthropicAdapter E2E', () => {
  it('completes one real Anthropic call', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new MissingApiKeyError('ANTHROPIC_API_KEY');
    }

    const adapter = new AnthropicAdapter();
    const result = await adapter.generate({
      systemPrompt: 'Return exactly: ok',
      contextMessages: [{ role: 'user', content: 'Say ok.' }],
      modelName:
        process.env.LLM_SALON_E2E_ANTHROPIC_MODEL ?? 'claude-haiku-4-5',
      maxTokens: 8,
      temperature: 1,
    });

    expect(result.content.toLowerCase()).toContain('ok');
  }, 75_000);
});
