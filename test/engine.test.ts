import assert from "node:assert/strict";
import test from "node:test";
import type {
  FimRequest,
  FimApiResult,
  FimClient,
} from "../src/api/client";
import type { ChatClient } from "../src/api/chatClient";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import type { ModelConfig } from "../src/core/types";
import { CompletionEngine } from "../src/engine";

const model: ModelConfig = {
  uid: "test",
  name: "Test",
  model: "test-model",
  apiUrl: "https://example.com/v1/completions",
  protocol: "openai",
};

test("engine builds context, calls the model, and cleans the response", async () => {
  let captured: FimRequest | undefined;
  const client = {
    complete: async (request: FimRequest): Promise<FimApiResult> => {
      captured = request;
      return {
        text: "a + b;\n}",
        latencyMs: 12,
        endpoint: "https://example.com/v1/completions",
        usage: { completionTokens: 3 },
      };
    },
  } as unknown as FimClient;

  const engine = new CompletionEngine({ client });
  const text = "function add(a, b) {\n  return ;\n}\n";
  const result = await engine.complete({
    text,
    offset: text.indexOf(";"),
    eol: "\n",
    model,
    apiKey: "secret",
    settings: DEFAULT_SETTINGS,
  });

  assert.ok(result);
  assert.equal(result.text, "a + b");
  assert.equal(captured?.apiKey, "secret");
  assert.equal(captured?.prompt, "function add(a, b) {\n  return ");
  assert.equal(captured?.suffix, ";\n}\n");
  assert.equal(result.prefixChars, captured?.prompt.length);
});

test("engine dispatches chat protocol to the chat client", async () => {
  const fimClient = {
    complete: async () => {
      throw new Error("FIM client should not be called");
    },
  } as unknown as FimClient;
  const chatClient = {
    complete: async (request: FimRequest): Promise<FimApiResult> => {
      assert.match(request.prompt, /return /);
      return {
        text: "return a + b",
        latencyMs: 4,
        endpoint: "https://example.com/v1/chat/completions",
        usage: { completionTokens: 4 },
      };
    },
  } as unknown as ChatClient;

  const engine = new CompletionEngine({ client: fimClient, chatClient });
  const text = "function add(a, b) {\n  return ;\n}\n";
  const result = await engine.complete({
    text,
    offset: text.indexOf(";"),
    eol: "\n",
    model: { ...model, protocol: "chat" },
    settings: DEFAULT_SETTINGS,
  });

  assert.ok(result);
  assert.equal(result.text, "return a + b");
  assert.equal(result.finishReason, undefined);
});

test("engine skips empty context and empty completions", async () => {
  let calls = 0;
  const client = {
    complete: async (): Promise<FimApiResult> => {
      calls += 1;
      return {
        text: "   ",
        latencyMs: 1,
        endpoint: "https://example.com/v1/completions",
        usage: {},
      };
    },
  } as unknown as FimClient;
  const engine = new CompletionEngine({ client });

  const empty = await engine.complete({
    text: "",
    offset: 0,
    eol: "\n",
    model,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(empty, null);
  assert.equal(calls, 0);

  const blank = await engine.complete({
    text: "const a = 1;",
    offset: 5,
    eol: "\n",
    model,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(blank, null);
  assert.equal(calls, 1);
});
