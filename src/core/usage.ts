export type UsageOutcome = "success" | "failure" | "cache";

export interface UsageRecord {
  timestamp: number;
  model: string;
  manual: boolean;
  outcome: UsageOutcome;
  latencyMs?: number;
  completionTokens?: number;
  error?: string;
}

export interface UsageStats {
  since: number;
  requests: number;
  successes: number;
  failures: number;
  retries: number;
  cacheHits: number;
  completionTokens: number;
  totalLatencyMs: number;
  lastLatencyMs?: number;
  lastError?: string;
  lastUpdated?: number;
  recent: UsageRecord[];
}

export type UsageEvent =
  | { type: "request" }
  | {
      type: "success";
      latencyMs: number;
      completionTokens?: number;
      model?: string;
      manual?: boolean;
    }
  | { type: "failure"; message: string; model?: string; manual?: boolean }
  | { type: "retry" }
  | { type: "cacheHit"; model?: string; manual?: boolean };

export function createUsageStats(now = Date.now()): UsageStats {
  return {
    since: now,
    requests: 0,
    successes: 0,
    failures: 0,
    retries: 0,
    cacheHits: 0,
    completionTokens: 0,
    totalLatencyMs: 0,
    recent: [],
  };
}

function appendRecord(
  stats: UsageStats,
  record: UsageRecord,
): UsageRecord[] {
  return [record, ...stats.recent].slice(0, 20);
}

export function applyUsageEvent(
  stats: UsageStats,
  event: UsageEvent,
  now = Date.now(),
): UsageStats {
  const next: UsageStats = { ...stats, lastUpdated: now, recent: stats.recent };
  switch (event.type) {
    case "request":
      next.requests += 1;
      break;
    case "success":
      next.successes += 1;
      next.totalLatencyMs += Math.max(0, event.latencyMs);
      next.lastLatencyMs = Math.max(0, event.latencyMs);
      next.completionTokens += Math.max(0, event.completionTokens ?? 0);
      next.lastError = undefined;
      next.recent = appendRecord(next, {
        timestamp: now,
        model: event.model ?? "unknown",
        manual: event.manual ?? false,
        outcome: "success",
        latencyMs: Math.max(0, event.latencyMs),
        completionTokens: event.completionTokens,
      });
      break;
    case "failure":
      next.failures += 1;
      next.lastError = event.message.slice(0, 300);
      next.recent = appendRecord(next, {
        timestamp: now,
        model: event.model ?? "unknown",
        manual: event.manual ?? false,
        outcome: "failure",
        error: event.message.slice(0, 300),
      });
      break;
    case "retry":
      next.retries += 1;
      break;
    case "cacheHit":
      next.cacheHits += 1;
      next.recent = appendRecord(next, {
        timestamp: now,
        model: event.model ?? "unknown",
        manual: event.manual ?? false,
        outcome: "cache",
      });
      break;
  }
  return next;
}

export function averageLatency(stats: UsageStats): number | undefined {
  return stats.successes > 0
    ? Math.round(stats.totalLatencyMs / stats.successes)
    : undefined;
}

export function formatUsageStats(stats: UsageStats): string[] {
  const lines = [
    `统计起始：${new Date(stats.since).toLocaleString()}`,
    `请求：${stats.requests} · 成功：${stats.successes} · 失败：${stats.failures}`,
    `重试：${stats.retries} · 缓存命中：${stats.cacheHits}`,
    `Completion Token：${stats.completionTokens}`,
  ];
  const average = averageLatency(stats);
  if (average !== undefined) {
    lines.push(
      `平均延迟：${average} ms · 最近延迟：${stats.lastLatencyMs ?? "—"} ms`,
    );
  }
  if (stats.lastError) {
    lines.push(`最近错误：${stats.lastError}`);
  }
  return lines;
}

export function formatRecentRequests(stats: UsageStats): string[] {
  if (stats.recent.length === 0) {
    return ["暂无请求记录。"];
  }
  return stats.recent.map((record) => {
    const time = new Date(record.timestamp).toLocaleTimeString();
    const trigger = record.manual ? "手动" : "自动";
    const details: string[] = [time, record.model, trigger, record.outcome];
    if (record.latencyMs !== undefined) {
      details.push(`${record.latencyMs} ms`);
    }
    if (record.completionTokens !== undefined) {
      details.push(`${record.completionTokens} Token`);
    }
    if (record.error) {
      details.push(record.error);
    }
    return details.join(" · ");
  });
}

function sanitizeRecent(value: unknown): UsageRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: UsageRecord[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const outcome =
      record.outcome === "success" ||
      record.outcome === "failure" ||
      record.outcome === "cache"
        ? record.outcome
        : undefined;
    if (!outcome) {
      continue;
    }
    result.push({
      timestamp:
        typeof record.timestamp === "number" && Number.isFinite(record.timestamp)
          ? record.timestamp
          : Date.now(),
      model: typeof record.model === "string" ? record.model : "unknown",
      manual: record.manual === true,
      outcome,
      latencyMs:
        typeof record.latencyMs === "number" && record.latencyMs >= 0
          ? record.latencyMs
          : undefined,
      completionTokens:
        typeof record.completionTokens === "number" &&
        record.completionTokens >= 0
          ? record.completionTokens
          : undefined,
      error: typeof record.error === "string" ? record.error : undefined,
    });
    if (result.length >= 20) {
      break;
    }
  }
  return result;
}

export function sanitizeUsageStats(value: unknown): UsageStats | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const read = (key: string): number => {
    const item = record[key];
    return typeof item === "number" && Number.isFinite(item) && item >= 0
      ? Math.floor(item)
      : 0;
  };
  const since =
    typeof record.since === "number" && Number.isFinite(record.since)
      ? record.since
      : Date.now();
  return {
    since,
    requests: read("requests"),
    successes: read("successes"),
    failures: read("failures"),
    retries: read("retries"),
    cacheHits: read("cacheHits"),
    completionTokens: read("completionTokens"),
    totalLatencyMs: read("totalLatencyMs"),
    lastLatencyMs:
      typeof record.lastLatencyMs === "number" &&
      Number.isFinite(record.lastLatencyMs) &&
      record.lastLatencyMs >= 0
        ? record.lastLatencyMs
        : undefined,
    lastError:
      typeof record.lastError === "string" ? record.lastError : undefined,
    lastUpdated:
      typeof record.lastUpdated === "number" &&
      Number.isFinite(record.lastUpdated)
        ? record.lastUpdated
        : undefined,
    recent: sanitizeRecent(record.recent),
  };
}
