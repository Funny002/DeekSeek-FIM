import { createHash } from "node:crypto";
import { BalanceClient } from "./api/balanceClient";
import type { AccountBalance } from "./core/balance";
import type { ModelConfig } from "./core/types";

interface CachedBalance {
  value: AccountBalance;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

export class BalanceService {
  private readonly cache = new Map<string, CachedBalance>();
  private readonly client: BalanceClient;

  constructor(client = new BalanceClient()) {
    this.client = client;
  }

  async get(
    model: ModelConfig,
    apiKey: string,
    force = false,
  ): Promise<AccountBalance> {
    const keyHash = createHash("sha256")
      .update(apiKey)
      .digest("hex")
      .slice(0, 16);
    const key = `${model.uid}|${model.apiUrl}|${keyHash}`;
    if (!force) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }

    const value = await this.client.get(model, apiKey);
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return value;
  }

  clear(): void {
    this.cache.clear();
  }
}
