import type { AccountBalance } from "../core/balance";
import { parseBalancePayload, resolveBalanceEndpoint } from "../core/balance";
import type { ModelConfig } from "../core/types";
import { FimRequestError } from "./errors";
import { fetchJson } from "./http";

interface BalanceClientOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

export class BalanceClient {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(options: BalanceClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? "deepseek-fim-vscode";
  }

  async get(
    model: ModelConfig,
    apiKey: string,
    signal?: AbortSignal,
    timeoutMs = 10_000,
  ): Promise<AccountBalance> {
    const endpoint = resolveBalanceEndpoint(model.apiUrl);
    const payload = await fetchJson({
      fetchImpl: this.fetchImpl,
      endpoint,
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": this.userAgent,
      },
      timeoutMs,
      signal,
    });

    try {
      const parsed = parseBalancePayload(payload);
      return {
        ...parsed,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      throw new FimRequestError(
        error instanceof Error ? error.message : "余额响应格式错误。",
        "invalid",
      );
    }
  }
}
