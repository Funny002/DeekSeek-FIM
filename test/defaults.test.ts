import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultModels, getPreset } from "../src/core/defaults";

test("default DeepSeek model matches the current FIM API", () => {
  const [model] = createDefaultModels();
  assert.ok(model);
  assert.equal(model.model, "deepseek-flash");
  assert.equal(model.apiUrl, "https://api.deepseek.com/beta/completions");
  assert.equal(model.protocol, "deepseek");
});

test("offers both DeepSeek FIM models", () => {
  const flash = getPreset("deepseek");
  const pro = getPreset("deepseek-pro");
  assert.equal(flash?.model, "deepseek-flash");
  assert.equal(pro?.model, "deepseek-v4-pro");
  assert.equal(pro?.apiUrl, "https://api.deepseek.com/beta/completions");
});
