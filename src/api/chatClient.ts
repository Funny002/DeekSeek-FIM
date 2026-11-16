import {
  buildChatUserPrompt,
  CHAT_SYSTEM_PROMPT,
  stripChatFences,
} from "../core/chatPrompt";
import { resolveChatEndpoint } from "../core/endpoint";
import { parseCompletionPayload } from "../core/response";
import type { FimApiResult, FimRequest } from "./client";
import { FimRequestError } from "./errors";
import { fetchJson } from "./http";

/**
 * Experimental fallback for chat-only OpenAI-compatible models. It asks the
 * model to return only the insertion text but cannot guarantee FIM quality.
 */
export class ChatClient {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(
    options: { fetchImpl?: typeof fetch; userAgent?: string } = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? "deepseek-fim-vscode";
  }

  async complete(request: FimRequest): Promise<FimApiResult> {
    const endpoint = resolveChatEndpoint(request.model.apiUrl);
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
        messages: [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildChatUserPrompt(request.prompt, request.suffix),
          },
        ],
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
        error instanceof Error ? error.message : "Chat 响应格式错误。",
        "invalid",
      );
    }

    return {
      text: stripChatFences(parsed.text),
      latencyMs: Date.now() - startedAt,
      endpoint,
      finishReason: parsed.finishReason,
      usage: parsed.usage,
    };
  }
}
