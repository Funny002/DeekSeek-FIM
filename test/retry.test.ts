import assert from "node:assert/strict";
import test from "node:test";
import { FimRequestError } from "../src/api/errors";
import { isRetryableError, retryDelay } from "../src/api/retry";

test("retries transient failures only", () => {
  assert.equal(isRetryableError(new FimRequestError("timeout", "timeout")), true);
  assert.equal(isRetryableError(new FimRequestError("network", "network")), true);
  assert.equal(isRetryableError(new FimRequestError("busy", "http", 429)), true);
  assert.equal(isRetryableError(new FimRequestError("server", "http", 503)), true);
  assert.equal(isRetryableError(new FimRequestError("auth", "http", 401)), false);
  assert.equal(isRetryableError(new FimRequestError("bad", "http", 400)), false);
  assert.equal(isRetryableError(new Error("unknown")), false);
});

test("retry delay grows linearly", () => {
  assert.equal(retryDelay(300, 1), 300);
  assert.equal(retryDelay(300, 2), 600);
  assert.equal(retryDelay(-10, 1), 0);
});
