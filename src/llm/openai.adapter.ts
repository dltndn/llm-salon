import { Injectable, Logger } from '@nestjs/common';
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from 'openai';
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import type {
  LlmAdapter,
  LlmGenerateInput,
  LlmGenerateResult,
  TokenUsage,
} from './llm-adapter.interface';
import { MissingApiKeyError, ProviderCallFailedError } from './llm.errors';

const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const OPENAI_TIMEOUT_MS = 60_000;
const OPENAI_MAX_RETRIES = 3;
const OPENAI_RETRY_BASE_DELAY_MS = 250;

interface OpenAiRequestOptions {
  timeout?: number;
}

interface OpenAiChatClient {
  chat: {
    completions: {
      create(
        body: ChatCompletionCreateParamsNonStreaming,
        options?: OpenAiRequestOptions,
      ): Promise<ChatCompletion>;
    };
  };
}

@Injectable()
export class OpenAiAdapter implements LlmAdapter {
  readonly providerName = 'openai';
  private readonly logger = new Logger(OpenAiAdapter.name);

  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const apiKey = process.env[OPENAI_API_KEY_ENV]?.trim();

    if (!apiKey) {
      throw new MissingApiKeyError(OPENAI_API_KEY_ENV);
    }

    const client = this.createClient(apiKey);
    const response = await this.createCompletionWithRetry(client, {
      model: input.modelName,
      messages: this.toChatMessages(input),
      max_completion_tokens: input.maxTokens,
      temperature: input.temperature,
      stream: false,
    });

    const content = response.choices[0]?.message.content ?? '';
    const usage = response.usage
      ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined;

    if (usage) {
      this.logTokenUsage(input.modelName, usage);
    }

    return { content, usage };
  }

  protected createClient(apiKey: string): OpenAiChatClient {
    return new OpenAI({
      apiKey,
      maxRetries: 0,
      timeout: OPENAI_TIMEOUT_MS,
    });
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async createCompletionWithRetry(
    client: OpenAiChatClient,
    params: ChatCompletionCreateParamsNonStreaming,
  ): Promise<ChatCompletion> {
    for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt += 1) {
      try {
        return await client.chat.completions.create(params, {
          timeout: OPENAI_TIMEOUT_MS,
        });
      } catch (error) {
        if (attempt < OPENAI_MAX_RETRIES && this.isRetryable(error)) {
          await this.sleep(this.retryDelayMs(attempt));
          continue;
        }

        throw new ProviderCallFailedError(
          this.providerName,
          this.formatProviderError(error),
          this.isTimeout(error) ? 'timeout' : 'bad_gateway',
        );
      }
    }

    throw new ProviderCallFailedError(this.providerName, 'unknown error');
  }

  private toChatMessages(input: LlmGenerateInput): ChatCompletionMessageParam[] {
    return [
      { role: 'system', content: input.systemPrompt },
      ...input.contextMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ];
  }

  private retryDelayMs(attempt: number): number {
    return OPENAI_RETRY_BASE_DELAY_MS * 2 ** attempt;
  }

  private logTokenUsage(modelName: string, usage: TokenUsage): void {
    this.logger.log(
      `OpenAI token usage model=${modelName} input=${usage.inputTokens} output=${usage.outputTokens} total=${usage.totalTokens}`,
    );
  }

  private isRetryable(error: unknown): boolean {
    if (
      error instanceof APIConnectionError ||
      error instanceof APIConnectionTimeoutError
    ) {
      return true;
    }

    if (error instanceof APIError) {
      return error.status === undefined || error.status >= 500;
    }

    return false;
  }

  private isTimeout(error: unknown): boolean {
    return error instanceof APIConnectionTimeoutError;
  }

  private formatProviderError(error: unknown): string {
    if (error instanceof Error) {
      return this.maskSecrets(error.message);
    }

    return 'unknown error';
  }

  private maskSecrets(message: string): string {
    const apiKey = process.env[OPENAI_API_KEY_ENV];
    const maskedApiKey =
      apiKey && apiKey.length > 0
        ? message.split(apiKey).join('[redacted]')
        : message;

    return maskedApiKey.replace(
      /Bearer\s+[A-Za-z0-9._-]+/g,
      'Bearer [redacted]',
    );
  }
}
