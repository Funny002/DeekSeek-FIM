import assert from "node:assert/strict";
import test from "node:test";
import {
  applyUsageEvent,
  averageLatency,
  createUsageStats,
  formatRecentRequests,
  formatUsageStats,
  sanitizeUsageStats,
} from "../src/core/usage";

test("accumulates usage events", () => {
  let stats = createUsageStats(1000);
  stats = applyUsageEvent(stats, { type: "request" }, 1001);
  stats = applyUsageEvent(stats, { type: "retry" }, 1002);
  stats = applyUsageEvent(
    stats,
    {
      type: "success",
      latencyMs: 200,
      completionTokens: 8,
      model: "deepseek-flash",
      manual: true,
    },
    1003,
  );
  stats = applyUsageEvent(stats, { type: "request" }, 1004);
  stats = applyUsageEvent(
    stats,
    { type: "failure", message: "boom", model: "deepseek-flash" },
    1005,
  );
  stats = applyUsageEvent(
    stats,
    { type: "cacheHit", model: "deepseek-flash" },
    1006,
  );

  assert.equal(stats.requests, 2);
  assert.equal(stats.successes, 1);
  assert.equal(stats.failures, 1);
  assert.equal(stats.retries, 1);
  assert.equal(stats.cacheHits, 1);
  assert.equal(stats.completionTokens, 8);
  assert.equal(stats.lastLatencyMs, 200);
  assert.equal(stats.lastError, "boom");
  assert.equal(averageLatency(stats), 200);
  assert.equal(stats.recent.length, 3);
  assert.equal(stats.recent[0]?.outcome, "cache");
  assert.equal(stats.recent[1]?.outcome, "failure");
  assert.equal(stats.recent[2]?.manual, true);
});

test("formats recent requests", () => {
  let stats = createUsageStats(0);
  stats = applyUsageEvent(
    stats,
    {
      type: "success",
      latencyMs: 44,
      completionTokens: 2,
      model: "deepseek-flash",
      manual: false,
    },
    1,
  );
  const text = formatRecentRequests(stats).join("\n");
  assert.match(text, /deepseek-flash/);
  assert.match(text, /自动/);
  assert.match(text, /success/);
  assert.match(text, /44 ms/);
});

test("formats usage stats", () => {
  const stats = applyUsageEvent(
    createUsageStats(0),
    { type: "success", latencyMs: 120, completionTokens: 3 },
    1,
  );
  const text = formatUsageStats(stats).join("\n");
  assert.match(text, /请求：0/);
  assert.match(text, /平均延迟：120 ms/);
  assert.match(text, /Completion Token：3/);
});

test("sanitizes stored stats", () => {
  assert.equal(sanitizeUsageStats(null), undefined);
  const stats = sanitizeUsageStats({
    since: 100,
    requests: 5,
    successes: 4,
    failures: 1,
    retries: 2,
    cacheHits: 3,
    completionTokens: 9,
    totalLatencyMs: 400,
    lastLatencyMs: 100,
    lastError: "x",
    recent: [
      {
        timestamp: 200,
        model: "deepseek-flash",
        manual: true,
        outcome: "success",
        latencyMs: 50,
      },
    ],
  });
  assert.equal(stats?.requests, 5);
  assert.equal(stats?.lastLatencyMs, 100);
  assert.equal(stats?.recent[0]?.outcome, "success");
});
