import { Logger } from '@nestjs/common';
import {
  GoogleGenerativeAIAbortError,
  GoogleGenerativeAIFetchError,
  type GenerateContentResult,
  type GenerativeModel,
} from '@google/generative-ai';

import { GoogleAdapter } from '../google.adapter';
import { MissingApiKeyError, ProviderCallFailedError } from '../llm.errors';

type GenerateContentMock = jest.Mock<
  Promise<GenerateContentResult>,
  [unknown, unknown?]
>;

class TestGoogleAdapter extends GoogleAdapter {
  readonly generateContent = jest.fn() as GenerateContentMock;
  readonly getGenerativeModel = jest.fn(() => ({
    generateContent: this.generateContent,
  })) as unknown as jest.Mock<GenerativeModel, [unknown, unknown?]>;
  readonly sleepCalls: number[] = [];

  protected createClient() {
    return {
      getGenerativeModel: this.getGenerativeModel,
    };
  }

  protected sleep(ms: number): Promise<void> {
    this.sleepCalls.push(ms);
    return Promise.resolve();
  }
}

const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
let loggerSpy: jest.SpyInstance;

function result(content = 'deterministic response'): GenerateContentResult {
  return {
    response: {
      text: () => content,
      usageMetadata: {
        promptTokenCount: 17,
        candidatesTokenCount: 9,
        totalTokenCount: 26,
      },
    },
  } as GenerateContentResult;
}

describe('GoogleAdapter', () => {
  beforeEach(() => {
    process.env.GOOGLE_API_KEY = 'test-google-key';
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    if (originalGoogleApiKey === undefined) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = originalGoogleApiKey;
    }

    jest.clearAllMocks();
    loggerSpy.mockRestore();
  });

  it('returns deterministic content and usage from the mocked SDK', async () => {
    const adapter = new TestGoogleAdapter();
    adapter.generateContent.mockResolvedValueOnce(result());

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [
          { role: 'system', content: 'context system' },
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
        ],
        modelName: 'gemini-test',
        maxTokens: 128,
        temperature: 0.2,
      }),
    ).resolves.toEqual({
      content: 'deterministic response',
      usage: {
        inputTokens: 17,
        outputTokens: 9,
        totalTokens: 26,
      },
    });

    expect(adapter.getGenerativeModel).toHaveBeenCalledWith(
      {
        model: 'gemini-test',
        systemInstruction: 'system\n\ncontext system',
      },
      { timeout: 60_000 },
    );
    expect(adapter.generateContent).toHaveBeenCalledWith(
      {
        contents: [
          { role: 'user', parts: [{ text: 'hello' }] },
          { role: 'model', parts: [{ text: 'hi' }] },
        ],
        generationConfig: {
          maxOutputTokens: 128,
          temperature: 0.2,
        },
      },
      { timeout: 60_000 },
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      'Google token usage model=gemini-test input=17 output=9 total=26',
    );
  });

  it('wraps SDK text helper failures in ProviderCallFailedError', async () => {
    const adapter = new TestGoogleAdapter();
    adapter.generateContent.mockResolvedValueOnce({
      response: {
        text: () => {
          throw new Error('blocked response for key=test-google-key');
        },
      },
    } as unknown as GenerateContentResult);

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [{ role: 'user', content: 'hello' }],
        modelName: 'gemini-test',
      }),
    ).rejects.toThrow(
      'google provider call failed: blocked response for key=[redacted]',
    );
  });

  it('throws MissingApiKeyError when GOOGLE_API_KEY is absent', async () => {
    delete process.env.GOOGLE_API_KEY;
    const adapter = new TestGoogleAdapter();

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'gemini-test',
      }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);

    expect(adapter.getGenerativeModel).not.toHaveBeenCalled();
  });

  it('retries 5xx failures up to three times before returning content', async () => {
    const adapter = new TestGoogleAdapter();
    const serverError = new GoogleGenerativeAIFetchError(
      'server unavailable',
      500,
      'Internal Server Error',
    );

    adapter.generateContent
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce(result('after retry'));

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'gemini-test',
      }),
    ).resolves.toMatchObject({ content: 'after retry' });

    expect(adapter.generateContent).toHaveBeenCalledTimes(4);
    expect(adapter.sleepCalls).toEqual([250, 500, 1_000]);
  });

  it('retries timeout failures', async () => {
    const adapter = new TestGoogleAdapter();
    const timeoutError = new GoogleGenerativeAIAbortError(
      'request timed out',
    );

    adapter.generateContent
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(result('after timeout'));

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'gemini-test',
      }),
    ).resolves.toMatchObject({ content: 'after timeout' });

    expect(adapter.generateContent).toHaveBeenCalledTimes(2);
    expect(adapter.sleepCalls).toEqual([250]);
  });

  it('throws ProviderCallFailedError after the final retry fails', async () => {
    const adapter = new TestGoogleAdapter();
    const networkError = new GoogleGenerativeAIFetchError(
      'network unavailable',
      undefined,
      undefined,
    );

    adapter.generateContent.mockRejectedValue(networkError);

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'gemini-test',
      }),
    ).rejects.toBeInstanceOf(ProviderCallFailedError);

    expect(adapter.generateContent).toHaveBeenCalledTimes(4);
  });

  it('does not retry 4xx failures', async () => {
    const adapter = new TestGoogleAdapter();
    const badRequest = new GoogleGenerativeAIFetchError(
      'bad request',
      400,
      'Bad Request',
    );

    adapter.generateContent.mockRejectedValueOnce(badRequest);

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'gemini-test',
      }),
    ).rejects.toBeInstanceOf(ProviderCallFailedError);

    expect(adapter.generateContent).toHaveBeenCalledTimes(1);
    expect(adapter.sleepCalls).toEqual([]);
  });

  it('masks known secrets from provider error messages', async () => {
    const adapter = new TestGoogleAdapter();
    adapter.generateContent.mockRejectedValueOnce(
      new Error('Authorization failed for key=test-google-key'),
    );

    await expect(
      adapter.generate({
        systemPrompt: 'system',
        contextMessages: [],
        modelName: 'gemini-test',
      }),
    ).rejects.toThrow('Authorization failed for key=[redacted]');
  });
});

const describeGoogleE2e =
  process.env.LLM_SALON_E2E === '1' ? describe : describe.skip;

describeGoogleE2e('GoogleAdapter E2E', () => {
  it('completes one real Google call', async () => {
    if (!process.env.GOOGLE_API_KEY) {
      throw new MissingApiKeyError('GOOGLE_API_KEY');
    }

    const adapter = new GoogleAdapter();
    const result = await adapter.generate({
      systemPrompt: 'Return exactly: ok',
      contextMessages: [{ role: 'user', content: 'Say ok.' }],
      modelName: process.env.LLM_SALON_E2E_GOOGLE_MODEL ?? 'gemini-2.0-flash',
      maxTokens: 8,
      temperature: 0,
    });

    expect(result.content.toLowerCase()).toContain('ok');
  }, 75_000);
});
