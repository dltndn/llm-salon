import { Injectable, Logger } from '@nestjs/common';
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIAbortError,
  GoogleGenerativeAIFetchError,
  type Content,
  type GenerateContentRequest,
  type GenerateContentResult,
  type GenerativeModel,
} from '@google/generative-ai';

import type {
  LlmAdapter,
  LlmContextMessage,
  LlmGenerateInput,
  LlmGenerateResult,
  TokenUsage,
} from './llm-adapter.interface';
import { MissingApiKeyError, ProviderCallFailedError } from './llm.errors';

const GOOGLE_API_KEY_ENV = 'GOOGLE_API_KEY';
const GOOGLE_TIMEOUT_MS = 60_000;
const GOOGLE_MAX_RETRIES = 3;
const GOOGLE_RETRY_BASE_DELAY_MS = 250;

interface GoogleClient {
  getGenerativeModel(
    modelParams: { model: string; systemInstruction?: string },
    requestOptions?: { timeout?: number },
  ): GenerativeModel;
}

@Injectable()
export class GoogleAdapter implements LlmAdapter {
  readonly providerName = 'google';
  private readonly logger = new Logger(GoogleAdapter.name);

  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const apiKey = process.env[GOOGLE_API_KEY_ENV]?.trim();

    if (!apiKey) {
      throw new MissingApiKeyError(GOOGLE_API_KEY_ENV);
    }

    const client = this.createClient(apiKey);
    const model = client.getGenerativeModel(
      {
        model: input.modelName,
        systemInstruction: this.toSystemInstruction(input),
      },
      { timeout: GOOGLE_TIMEOUT_MS },
    );
    const response = await this.generateContentWithRetry(model, {
      contents: this.toContents(input.contextMessages),
      generationConfig: {
        maxOutputTokens: input.maxTokens,
        temperature: input.temperature,
      },
    });

    const content = this.toContent(response);
    const usage = response.response.usageMetadata
      ? {
          inputTokens: response.response.usageMetadata.promptTokenCount,
          outputTokens: response.response.usageMetadata.candidatesTokenCount,
          totalTokens: response.response.usageMetadata.totalTokenCount,
        }
      : undefined;

    if (usage) {
      this.logTokenUsage(input.modelName, usage);
    }

    return { content, usage };
  }

  protected createClient(apiKey: string): GoogleClient {
    return new GoogleGenerativeAI(apiKey);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async generateContentWithRetry(
    model: GenerativeModel,
    request: GenerateContentRequest,
  ): Promise<GenerateContentResult> {
    for (let attempt = 0; attempt <= GOOGLE_MAX_RETRIES; attempt += 1) {
      try {
        return await model.generateContent(request, {
          timeout: GOOGLE_TIMEOUT_MS,
        });
      } catch (error) {
        if (attempt < GOOGLE_MAX_RETRIES && this.isRetryable(error)) {
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

  private toContent(response: GenerateContentResult): string {
    try {
      return response.response.text();
    } catch (error) {
      throw new ProviderCallFailedError(
        this.providerName,
        this.formatProviderError(error),
      );
    }
  }

  private toSystemInstruction(input: LlmGenerateInput): string {
    const contextSystemMessages = input.contextMessages
      .filter((message) => message.role === 'system')
      .map((message) => message.content);

    return [input.systemPrompt, ...contextSystemMessages].join('\n\n');
  }

  private toContents(messages: LlmContextMessage[]): Content[] {
    const contents = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })) satisfies Content[];

    if (contents.length > 0) {
      return contents;
    }

    return [{ role: 'user', parts: [{ text: '' }] }];
  }

  private retryDelayMs(attempt: number): number {
    return GOOGLE_RETRY_BASE_DELAY_MS * 2 ** attempt;
  }

  private logTokenUsage(modelName: string, usage: TokenUsage): void {
    this.logger.log(
      `Google token usage model=${modelName} input=${usage.inputTokens} output=${usage.outputTokens} total=${usage.totalTokens}`,
    );
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof GoogleGenerativeAIAbortError) {
      return true;
    }

    if (error instanceof GoogleGenerativeAIFetchError) {
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
    const apiKey = process.env[GOOGLE_API_KEY_ENV];
    const maskedApiKey =
      apiKey && apiKey.length > 0
        ? message.split(apiKey).join('[redacted]')
        : message;

    return maskedApiKey.replace(
      /(key=|Bearer\s+)[A-Za-z0-9._-]+/g,
      '$1[redacted]',
    );
  }
}
