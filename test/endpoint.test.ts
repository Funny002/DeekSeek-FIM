import assert from "node:assert/strict";
import test from "node:test";
import {
  isLocalEndpoint,
  resolveChatEndpoint,
  resolveCompletionsEndpoint,
  validateApiUrl,
} from "../src/core/endpoint";

test("resolves DeepSeek base URLs", () => {
  assert.equal(
    resolveCompletionsEndpoint("https://api.deepseek.com", "deepseek"),
    "https://api.deepseek.com/beta/completions",
  );
  assert.equal(
    resolveCompletionsEndpoint("https://api.deepseek.com/beta", "deepseek"),
    "https://api.deepseek.com/beta/completions",
  );
  assert.equal(
    resolveCompletionsEndpoint(
      "https://api.deepseek.com/beta/completions",
      "deepseek",
    ),
    "https://api.deepseek.com/beta/completions",
  );
  assert.equal(
    resolveCompletionsEndpoint("https://api.deepseek.com/v1", "deepseek"),
    "https://api.deepseek.com/beta/completions",
  );
  assert.equal(
    resolveCompletionsEndpoint(
      "https://api.deepseek.com/v1/completions",
      "deepseek",
    ),
    "https://api.deepseek.com/beta/completions",
  );
  assert.equal(
    resolveCompletionsEndpoint("https://api.deepseek.com?x=1", "deepseek"),
    "https://api.deepseek.com/beta/completions?x=1",
  );
});

test("resolves OpenAI-compatible base URLs", () => {
  assert.equal(
    resolveCompletionsEndpoint("https://api.openai.com", "openai"),
    "https://api.openai.com/v1/completions",
  );
  assert.equal(
    resolveCompletionsEndpoint("https://api.siliconflow.cn/v1", "openai"),
    "https://api.siliconflow.cn/v1/completions",
  );
  assert.equal(
    resolveCompletionsEndpoint(
      "http://127.0.0.1:11434/v1/completions",
      "openai",
    ),
    "http://127.0.0.1:11434/v1/completions",
  );
});

test("keeps query parameters and strips the hash", () => {
  assert.equal(
    resolveCompletionsEndpoint("https://example.com/v1?x=1#frag", "openai"),
    "https://example.com/v1/completions?x=1",
  );
});

test("resolves chat completion endpoints", () => {
  assert.equal(
    resolveChatEndpoint("https://api.deepseek.com"),
    "https://api.deepseek.com/chat/completions",
  );
  assert.equal(
    resolveChatEndpoint("https://api.openai.com/v1"),
    "https://api.openai.com/v1/chat/completions",
  );
  assert.equal(
    resolveChatEndpoint("http://127.0.0.1:11434/v1/completions"),
    "http://127.0.0.1:11434/v1/chat/completions",
  );
  assert.equal(
    resolveChatEndpoint("https://proxy.example.com/api/completions"),
    "https://proxy.example.com/api/chat/completions",
  );
  assert.equal(
    resolveChatEndpoint("https://api.openai.com/v1/chat/completions"),
    "https://api.openai.com/v1/chat/completions",
  );
});

test("detects local endpoints", () => {
  assert.equal(isLocalEndpoint("http://127.0.0.1:11434/v1"), true);
  assert.equal(isLocalEndpoint("http://localhost:8080/v1"), true);
  assert.equal(isLocalEndpoint("http://[::1]:8080/v1"), true);
  assert.equal(isLocalEndpoint("https://api.deepseek.com/beta"), false);
  assert.equal(isLocalEndpoint("not a url"), false);
});

test("rejects non-http URLs", () => {
  assert.throws(() => validateApiUrl("ftp://example.com"), /http/);
  assert.throws(() => validateApiUrl("not a url"), /URL/);
});
