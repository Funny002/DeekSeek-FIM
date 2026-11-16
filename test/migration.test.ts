import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODEL_UID } from "../src/core/defaults";
import { migrateLegacyModels } from "../src/core/migration";
import type { ModelConfig } from "../src/core/types";

test("migrates legacy DeepSeek FIM model ids", () => {
  const models: ModelConfig[] = [
    {
      uid: DEFAULT_MODEL_UID,
      name: "DeepSeek FIM",
      model: "deepseek-chat",
      apiUrl: "https://api.deepseek.com/beta/completions",
      protocol: "deepseek",
    },
    {
      uid: "custom",
      name: "My model",
      model: "deepseek-chat",
      apiUrl: "https://proxy.example.com/v1/completions",
      protocol: "openai",
    },
  ];
  assert.equal(migrateLegacyModels(models), 1);
  assert.equal(models[0]?.model, "deepseek-flash");
  assert.equal(models[0]?.name, "DeepSeek FIM · Flash");
  assert.equal(models[1]?.model, "deepseek-chat");
});

test("is idempotent", () => {
  const models: ModelConfig[] = [
    {
      uid: "x",
      name: "Legacy",
      model: "deepseek-chat",
      apiUrl: "https://api.deepseek.com/beta/completions",
      protocol: "deepseek",
    },
  ];
  assert.equal(migrateLegacyModels(models), 1);
  assert.equal(migrateLegacyModels(models), 0);
});
