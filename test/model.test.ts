import assert from "node:assert/strict";
import test from "node:test";
import { validateModelDraft } from "../src/core/model";

test("validates and trims a model draft", () => {
  const model = validateModelDraft({
    name: " DeepSeek ",
    model: " deepseek-flash ",
    apiUrl: " https://api.deepseek.com/beta ",
    protocol: "deepseek",
  });
  assert.equal(model.name, "DeepSeek");
  assert.equal(model.model, "deepseek-flash");
  assert.equal(model.apiUrl, "https://api.deepseek.com/beta");
  assert.equal(model.protocol, "deepseek");
});

test("rejects missing fields", () => {
  assert.throws(
    () =>
      validateModelDraft({
        name: "",
        model: "deepseek-chat",
        apiUrl: "https://api.deepseek.com",
        protocol: "deepseek",
      }),
    /名称/,
  );
  assert.throws(
    () =>
      validateModelDraft({
        name: "x",
        model: "",
        apiUrl: "https://api.deepseek.com",
        protocol: "deepseek",
      }),
    /模型 ID/,
  );
  assert.throws(
    () =>
      validateModelDraft({
        name: "x",
        model: "y",
        apiUrl: "",
        protocol: "deepseek",
      }),
    /API 地址/,
  );
});

test("accepts chat protocol", () => {
  const model = validateModelDraft({
    name: "Chat",
    model: "chat-model",
    apiUrl: "https://api.deepseek.com",
    protocol: "chat",
  });
  assert.equal(model.protocol, "chat");
});

test("rejects credentials embedded in the URL", () => {
  assert.throws(
    () =>
      validateModelDraft({
        name: "x",
        model: "y",
        apiUrl: "https://user:pass@example.com/v1",
        protocol: "openai",
      }),
    /账号密码/,
  );
});
