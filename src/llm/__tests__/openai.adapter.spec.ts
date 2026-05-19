import { Logger } from '@nestjs/common';
import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai';
import type { ChatCompletion } from 'openai/resources/chat/completions';

import { MissingApiKeyError, ProviderCallFailedError } from '../llm.errors';
import { OpenAiAdapter } from '../openai.adapter';

type CreateMock = jest.Mock<Promise<ChatCompletion>, [unknown, unknown?]>;

class TestOpenAiAdapter extends OpenAiAdapter {
  readonly create = jest.fn() as CreateMock;
  readonly sleepCalls: number[] = [];

  protected createClient() {
    return {
      chat: {
        completions: {
          create: this.create,
        },
      },
    };
  }

  protected sleep(ms: number): Promise<void> {
    this.sleepCalls.push(ms);
    return Promise.resolve();
  }
}

const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
let loggerSpy: jest.SpyInstance;

function completion(content = 'deterministic response'): ChatCompletion {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1,
    model: 'gpt-test',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
        message: {
          role: 'assistant',
          content,
          refusal: null,
        },
      },
    ],
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
    },
  };
}

describe('OpenAiAdapter', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }

    jest.clearAllMocks();
    loggerSpy.mockRestore();
  });

  it('returns deterministic content and usage from the mocked SDK', async () => {
    const adapter = new TestOpenAiAdapter();
    adapter.create.mockResolvedValueOnce(completion());

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [{ role: 'user', content: 'hello' }],
        modelName: 'gpt-test',
        maxTokens: 128,
        temperature: 0.2,
      }),
    ).resolves.toEqual({
      content: 'deterministic response',
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
      },
    });

    expect(adapter.create).toHaveBeenCalledWith(
      {
        model: 'gpt-test',
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'hello' },
        ],
        max_completion_tokens: 128,
        temperature: 0.2,
        stream: false,
      },
      { timeout: 60_000 },
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      'OpenAI token usage model=gpt-test input=11 output=7 total=18',
    );
  });

  it('throws MissingApiKeyError when OPENAI_API_KEY is absent', async () => {
    delete process.env.OPENAI_API_KEY;
    const adapter = new TestOpenAiAdapter();

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'gpt-test',
      }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);

    expect(adapter.create).not.toHaveBeenCalled();
  });

  it('retries 5xx failures up to three times before returning content', async () => {
    const adapter = new TestOpenAiAdapter();
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
      .mockResolvedValueOnce(completion('after retry'));

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'gpt-test',
      }),
    ).resolves.toMatchObject({ content: 'after retry' });

    expect(adapter.create).toHaveBeenCalledTimes(4);
    expect(adapter.sleepCalls).toEqual([250, 500, 1_000]);
  });

  it('retries timeout failures', async () => {
    const adapter = new TestOpenAiAdapter();
    const timeoutError = new APIConnectionTimeoutError({
      message: 'request timed out',
    });

    adapter.create
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(completion('after timeout'));

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'gpt-test',
      }),
    ).resolves.toMatchObject({ content: 'after timeout' });

    expect(adapter.create).toHaveBeenCalledTimes(2);
    expect(adapter.sleepCalls).toEqual([250]);
  });

  it('throws ProviderCallFailedError after the final retry fails', async () => {
    const adapter = new TestOpenAiAdapter();
    const networkError = new APIConnectionError({
      message: 'network unavailable',
    });

    adapter.create.mockRejectedValue(networkError);

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'gpt-test',
      }),
    ).rejects.toBeInstanceOf(ProviderCallFailedError);

    expect(adapter.create).toHaveBeenCalledTimes(4);
  });

  it('does not retry 4xx failures', async () => {
    const adapter = new TestOpenAiAdapter();
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
        modelName: 'gpt-test',
      }),
    ).rejects.toBeInstanceOf(ProviderCallFailedError);

    expect(adapter.create).toHaveBeenCalledTimes(1);
    expect(adapter.sleepCalls).toEqual([]);
  });

  it('masks known secrets from provider error messages', async () => {
    const adapter = new TestOpenAiAdapter();
    adapter.create.mockRejectedValueOnce(
      new Error('Authorization failed for test-openai-key'),
    );

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'gpt-test',
      }),
    ).rejects.toThrow('Authorization failed for [redacted]');
  });
});

const describeOpenAiE2e =
  process.env.LLM_SALON_E2E === '1' ? describe : describe.skip;

describeOpenAiE2e('OpenAiAdapter E2E', () => {
  it('completes one real OpenAI call', async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new MissingApiKeyError('OPENAI_API_KEY');
    }

    const adapter = new OpenAiAdapter();
    const result = await adapter.generate({
      systemPrompt: 'Return exactly: ok',
      contextMessages: [{ role: 'user', content: 'Say ok.' }],
      modelName: process.env.LLM_SALON_E2E_OPENAI_MODEL ?? 'gpt-4o-mini',
      maxTokens: 8,
      temperature: 0,
    });

    expect(result.content.toLowerCase()).toContain('ok');
  }, 75_000);
});
