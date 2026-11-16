import assert from "node:assert/strict";
import test from "node:test";
import {
  extractErrorMessage,
  parseCompletionPayload,
} from "../src/core/response";

test("parses a completions response", () => {
  const parsed = parseCompletionPayload({
    choices: [{ text: "a + b", finish_reason: "stop" }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 3,
      total_tokens: 13,
    },
  });
  assert.equal(parsed.text, "a + b");
  assert.equal(parsed.finishReason, "stop");
  assert.equal(parsed.usage.completionTokens, 3);
});

test("parses a chat-style message as a fallback", () => {
  const parsed = parseCompletionPayload({
    choices: [{ message: { content: "return 1;" } }],
  });
  assert.equal(parsed.text, "return 1;");
});

test("rejects malformed payloads", () => {
  assert.throws(() => parseCompletionPayload({}), /choices/);
  assert.throws(() => parseCompletionPayload({ choices: [] }), /choices/);
  assert.throws(
    () => parseCompletionPayload({ choices: [{}] }),
    /补全文本/,
  );
});

test("extracts server error messages", () => {
  assert.equal(
    extractErrorMessage({ error: { message: "bad key" } }, "fallback"),
    "bad key",
  );
  assert.equal(extractErrorMessage("plain error", "fallback"), "plain error");
  assert.equal(extractErrorMessage({}, "fallback"), "fallback");
});
