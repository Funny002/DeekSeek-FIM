import type { ApiModelInfo } from "../core/models";
import { parseModelsPayload, resolveModelsEndpoint } from "../core/models";
import { FimRequestError } from "./errors";
import { fetchJson } from "./http";

interface ModelsClientOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

export class ModelsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(options: ModelsClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? "deepseek-fim-vscode";
  }

  async list(
    apiUrl: string,
    apiKey?: string,
    signal?: AbortSignal,
    timeoutMs = 10_000,
  ): Promise<ApiModelInfo[]> {
    const endpoint = resolveModelsEndpoint(apiUrl);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    if (apiKey?.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const payload = await fetchJson({
      fetchImpl: this.fetchImpl,
      endpoint,
      method: "GET",
      headers,
      timeoutMs,
      signal,
    });

    try {
      return parseModelsPayload(payload);
    } catch (error) {
      throw new FimRequestError(
        error instanceof Error ? error.message : "模型列表格式错误。",
        "invalid",
      );
    }
  }
}
