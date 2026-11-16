export interface BalanceInfo {
  currency: string;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
}

export interface AccountBalance {
  isAvailable: boolean;
  balances: BalanceInfo[];
  fetchedAt: number;
}

export interface ParsedBalance {
  isAvailable: boolean;
  balances: BalanceInfo[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readAmount(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}

export function parseBalancePayload(payload: unknown): ParsedBalance {
  if (!isRecord(payload)) {
    throw new Error("余额接口返回了非 JSON 对象。");
  }
  if (!Array.isArray(payload.balance_infos)) {
    throw new Error("余额响应缺少 balance_infos。");
  }

  const balances: BalanceInfo[] = [];
  for (const item of payload.balance_infos) {
    if (!isRecord(item)) {
      continue;
    }
    balances.push({
      currency: readString(item, "currency"),
      totalBalance: readAmount(item, "total_balance"),
      grantedBalance: readAmount(item, "granted_balance"),
      toppedUpBalance: readAmount(item, "topped_up_balance"),
    });
  }

  return {
    isAvailable: payload.is_available === true,
    balances,
  };
}

/**
 * The balance API lives at the API origin, not under the /beta FIM prefix.
 * Example: https://api.deepseek.com/beta/completions ->
 *          https://api.deepseek.com/user/balance
 */
export function resolveBalanceEndpoint(apiUrl: string): string {
  const url = new URL(apiUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("余额接口只支持 http:// 或 https://。");
  }
  url.pathname = "/user/balance";
  url.search = "";
  url.hash = "";
  return url.toString();
}
