import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBalancePayload,
  resolveBalanceEndpoint,
} from "../src/core/balance";

test("parses DeepSeek balance data", () => {
  const parsed = parseBalancePayload({
    is_available: true,
    balance_infos: [
      {
        currency: "CNY",
        total_balance: "12.34",
        granted_balance: "2.00",
        topped_up_balance: "10.34",
      },
      {
        currency: "USD",
        total_balance: "1.50",
        granted_balance: "0.00",
        topped_up_balance: "1.50",
      },
    ],
  });
  assert.equal(parsed.isAvailable, true);
  assert.equal(parsed.balances.length, 2);
  assert.deepEqual(parsed.balances[0], {
    currency: "CNY",
    totalBalance: "12.34",
    grantedBalance: "2.00",
    toppedUpBalance: "10.34",
  });
});

test("uses the API origin for the balance endpoint", () => {
  assert.equal(
    resolveBalanceEndpoint("https://api.deepseek.com/beta/completions"),
    "https://api.deepseek.com/user/balance",
  );
  assert.equal(
    resolveBalanceEndpoint("https://api.deepseek.com"),
    "https://api.deepseek.com/user/balance",
  );
});

test("rejects malformed balance responses", () => {
  assert.throws(() => parseBalancePayload({}), /balance_infos/);
  assert.throws(() => parseBalancePayload(null), /非 JSON/);
});
