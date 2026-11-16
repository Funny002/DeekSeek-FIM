import { resolveCompletionsEndpoint } from "../core/endpoint";
import { parseCompletionPayload } from "../core/response";
import type { ModelConfig } from "../core/types";
import { FimRequestError } from "./errors";
import { fetchJson } from "./http";

export interface FimRequest {
  model: ModelConfig;
  apiKey?: string;
  prompt: string;
  suffix: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  stop?: string[];
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface FimApiResult {
  text: string;
  latencyMs: number;
  endpoint: string;
  finishReason?: string;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

interface FimClientOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

/**
 * Client for OpenAI-compatible FIM /completions APIs, including the DeepSeek
 * beta endpoint.
 */
export class FimClient {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(options: FimClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? "deepseek-fim-vscode";
  }

  async complete(request: FimRequest): Promise<FimApiResult> {
    const endpoint = resolveCompletionsEndpoint(
      request.model.apiUrl,
      request.model.protocol,
    );
    const startedAt = Date.now();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    const apiKey = request.apiKey?.trim();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const payload = await fetchJson({
      fetchImpl: this.fetchImpl,
      endpoint,
      method: "POST",
      headers,
      body: JSON.stringify({
        model: request.model.model,
        prompt: request.prompt,
        suffix: request.suffix,
        max_tokens: Math.max(1, Math.floor(request.maxTokens)),
        temperature: request.temperature,
        top_p: request.topP,
        ...(request.stop && request.stop.length > 0
          ? { stop: request.stop }
          : {}),
        stream: false,
      }),
      timeoutMs: request.timeoutMs,
      signal: request.signal,
    });

    let parsed: ReturnType<typeof parseCompletionPayload>;
    try {
      parsed = parseCompletionPayload(payload);
    } catch (error) {
      throw new FimRequestError(
        error instanceof Error ? error.message : "补全响应格式错误。",
        "invalid",
      );
    }

    return {
      text: parsed.text,
      latencyMs: Date.now() - startedAt,
      endpoint,
      finishReason: parsed.finishReason,
      usage: parsed.usage,
    };
  }
}
