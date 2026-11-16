import assert from "node:assert/strict";
import test from "node:test";
import {
  parseModelsPayload,
  resolveModelsEndpoint,
} from "../src/core/models";

test("parses model metadata", () => {
  const models = parseModelsPayload({
    object: "list",
    data: [
      {
        id: "deepseek-flash",
        object: "model",
        owned_by: "deepseek",
        name: "DeepSeek Flash",
        context_window: 128000,
        max_output_tokens: 4096,
        input_modalities: ["text"],
        output_modalities: ["text"],
      },
      {
        id: "deepseek-flash",
        object: "model",
        owned_by: "deepseek",
      },
      {
        id: "deepseek-v4-pro",
        object: "model",
        owned_by: "deepseek",
      },
    ],
  });
  assert.equal(models.length, 2);
  assert.equal(models[0]?.id, "deepseek-flash");
  assert.equal(models[0]?.name, "DeepSeek Flash");
  assert.equal(models[0]?.contextWindow, 128000);
  assert.equal(models[0]?.maxOutputTokens, 4096);
  assert.equal(models[0]?.inputModalities[0], "text");
});

test("resolves the models endpoint from an API URL", () => {
  assert.equal(
    resolveModelsEndpoint("https://api.deepseek.com/beta/completions"),
    "https://api.deepseek.com/models",
  );
  assert.equal(
    resolveModelsEndpoint("https://api.openai.com/v1"),
    "https://api.openai.com/v1/models",
  );
  assert.equal(
    resolveModelsEndpoint("http://127.0.0.1:11434/v1/completions"),
    "http://127.0.0.1:11434/v1/models",
  );
  assert.equal(
    resolveModelsEndpoint("https://proxy.example.com/api/completions"),
    "https://proxy.example.com/api/models",
  );
});

test("rejects malformed model lists", () => {
  assert.throws(() => parseModelsPayload({}), /data/);
  assert.throws(() => parseModelsPayload(null), /data/);
});
