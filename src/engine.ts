import { ChatClient } from "./api/chatClient";
import { FimClient } from "./api/client";
import { cleanCompletion } from "./core/completion";
import { buildFimContext } from "./core/context";
import type {
  CompletionResult,
  FimSettings,
  ModelConfig,
} from "./core/types";

export interface EngineRequest {
  text: string;
  offset: number;
  eol: string;
  model: ModelConfig;
  apiKey?: string;
  settings: FimSettings;
  signal?: AbortSignal;
}

export interface CompletionEngineOptions {
  client?: FimClient;
  chatClient?: ChatClient;
}

/**
 * API-independent completion flow: build bounded FIM context, call the model,
 * then clean the middle text. Kept free of the VS Code API for unit testing.
 */
export class CompletionEngine {
  private readonly client: FimClient;
  private readonly chatClient: ChatClient;

  constructor(options: CompletionEngineOptions = {}) {
    this.client = options.client ?? new FimClient();
    this.chatClient = options.chatClient ?? new ChatClient();
  }

  async complete(request: EngineRequest): Promise<CompletionResult | null> {
    const { prefix, suffix } = buildFimContext(request.text, request.offset, {
      maxPrefixChars: request.settings.maxPrefixChars,
      maxSuffixChars: request.settings.maxSuffixChars,
      contextLines: request.settings.contextLines,
    });

    if (!prefix.trim() && !suffix.trim()) {
      return null;
    }

    const apiRequest = {
      model: request.model,
      apiKey: request.apiKey,
      prompt: prefix,
      suffix,
      maxTokens: request.settings.maxTokens,
      temperature: request.settings.temperature,
      topP: request.settings.topP,
      stop: request.settings.stopSequences,
      timeoutMs: request.settings.requestTimeoutMs,
      signal: request.signal,
    };
    const response =
      request.model.protocol === "chat"
        ? await this.chatClient.complete(apiRequest)
        : await this.client.complete(apiRequest);

    const text = cleanCompletion(response.text, {
      prefix,
      suffix,
      multiLine: request.settings.multiLine,
      eol: request.eol,
    });
    if (!text) {
      return null;
    }

    return {
      text,
      latencyMs: response.latencyMs,
      usage: response.usage,
      prefixChars: prefix.length,
      suffixChars: suffix.length,
      finishReason: response.finishReason,
    };
  }
}
