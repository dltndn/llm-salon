import { Injectable, Logger } from '@nestjs/common';
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from '@anthropic-ai/sdk';
import type {
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
} from '@anthropic-ai/sdk/resources/messages';

import type {
  LlmAdapter,
  LlmContextMessage,
  LlmGenerateInput,
  LlmGenerateResult,
  TokenUsage,
} from './llm-adapter.interface';
import { MissingApiKeyError, ProviderCallFailedError } from './llm.errors';
import { getModelMetadata } from './models';

const ANTHROPIC_API_KEY_ENV = 'ANTHROPIC_API_KEY';
const ANTHROPIC_TIMEOUT_MS = 60_000;
const ANTHROPIC_MAX_RETRIES = 3;
const ANTHROPIC_RETRY_BASE_DELAY_MS = 250;

interface AnthropicRequestOptions {
  timeout?: number;
}

interface AnthropicMessagesClient {
  messages: {
    create(
      body: MessageCreateParamsNonStreaming,
      options?: AnthropicRequestOptions,
    ): Promise<Message>;
  };
}

@Injectable()
export class AnthropicAdapter implements LlmAdapter {
  readonly providerName = 'anthropic';
  private readonly logger = new Logger(AnthropicAdapter.name);

  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const apiKey = process.env[ANTHROPIC_API_KEY_ENV]?.trim();

    if (!apiKey) {
      throw new MissingApiKeyError(ANTHROPIC_API_KEY_ENV);
    }

    const client = this.createClient(apiKey);
    const response = await this.createMessageWithRetry(client, {
      model: input.modelName,
      system: this.toSystemPrompt(input),
      messages: this.toMessages(input.contextMessages),
      max_tokens: this.resolveMaxTokens(input),
      temperature: input.temperature,
      stream: false,
    });

    const content = this.toContent(response);
    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens:
        response.usage.input_tokens + response.usage.output_tokens,
    };

    this.logTokenUsage(input.modelName, usage);

    return { content, usage };
  }

  protected createClient(apiKey: string): AnthropicMessagesClient {
    return new Anthropic({
      apiKey,
      maxRetries: 0,
      timeout: ANTHROPIC_TIMEOUT_MS,
    });
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async createMessageWithRetry(
    client: AnthropicMessagesClient,
    params: MessageCreateParamsNonStreaming,
  ): Promise<Message> {
    for (let attempt = 0; attempt <= ANTHROPIC_MAX_RETRIES; attempt += 1) {
      try {
        return await client.messages.create(params, {
          timeout: ANTHROPIC_TIMEOUT_MS,
        });
      } catch (error) {
        if (attempt < ANTHROPIC_MAX_RETRIES && this.isRetryable(error)) {
          await this.sleep(this.retryDelayMs(attempt));
          continue;
        }

        throw new ProviderCallFailedError(
          this.providerName,
          this.formatProviderError(error),
        );
      }
    }

    throw new ProviderCallFailedError(this.providerName, 'unknown error');
  }

  private toSystemPrompt(input: LlmGenerateInput): string {
    const contextSystemMessages = input.contextMessages
      .filter((message) => message.role === 'system')
      .map((message) => message.content);

    return [input.systemPrompt, ...contextSystemMessages].join('\n\n');
  }

  private toMessages(messages: LlmContextMessage[]): MessageParam[] {
    const mappedMessages = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      })) satisfies MessageParam[];

    if (mappedMessages.length > 0) {
      return mappedMessages;
    }

    return [{ role: 'user', content: '' }];
  }

  private resolveMaxTokens(input: LlmGenerateInput): number {
    return (
      input.maxTokens ??
      getModelMetadata(input.modelName)?.recommendedMaxOutputTokens ??
      1024
    );
  }

  private toContent(response: Message): string {
    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  private retryDelayMs(attempt: number): number {
    return ANTHROPIC_RETRY_BASE_DELAY_MS * 2 ** attempt;
  }

  private logTokenUsage(modelName: string, usage: TokenUsage): void {
    this.logger.log(
      `Anthropic token usage model=${modelName} input=${usage.inputTokens} output=${usage.outputTokens} total=${usage.totalTokens}`,
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

  private formatProviderError(error: unknown): string {
    if (error instanceof Error) {
      return this.maskSecrets(error.message);
    }

    return 'unknown error';
  }

  private maskSecrets(message: string): string {
    const apiKey = process.env[ANTHROPIC_API_KEY_ENV];
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
