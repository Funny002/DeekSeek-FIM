import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import {
  normalizeSettings,
  parseLanguages,
  parseStopSequences,
  readSettings,
  settingsToConfig,
} from "../src/core/settings";

test("normalizes and clamps settings", () => {
  const settings = normalizeSettings({
    maxTokens: 99999,
    contextLines: -4,
    debounceMs: 42.6,
    temperature: 3,
    topP: 0.2,
    retryCount: 9,
    retryDelayMs: 9999,
    languages: ["TypeScript", " typescript ", "python"],
  });
  assert.equal(settings.maxTokens, 4096);
  assert.equal(settings.contextLines, 0);
  assert.equal(settings.debounceMs, 43);
  assert.equal(settings.temperature, 2);
  assert.equal(settings.topP, 0.2);
  assert.equal(settings.retryCount, 2);
  assert.equal(settings.retryDelayMs, 2000);
  assert.deepEqual(settings.languages, ["typescript", "python"]);
});

test("falls back for invalid values", () => {
  const settings = normalizeSettings({
    maxTokens: "nope",
    enabled: "yes",
    contextLines: Number.NaN,
    topP: 0,
  });
  assert.equal(settings.maxTokens, DEFAULT_SETTINGS.maxTokens);
  assert.equal(settings.enabled, DEFAULT_SETTINGS.enabled);
  assert.equal(settings.contextLines, DEFAULT_SETTINGS.contextLines);
  assert.equal(settings.topP, 0.001);
});

test("reads settings through a getter", () => {
  const values: Record<string, unknown> = {
    maxTokens: 256,
    languages: "typescript, python",
  };
  const settings = readSettings((key, fallback) => values[key] ?? fallback);
  assert.equal(settings.maxTokens, 256);
  assert.deepEqual(settings.languages, ["typescript", "python"]);
});

test("serializes languages as a comma-separated string", () => {
  const config = settingsToConfig({ ...DEFAULT_SETTINGS, languages: ["rust"] });
  assert.equal(config.languages, "rust");
});

test("parses stop sequences with escapes and a limit", () => {
  assert.deepEqual(parseStopSequences("\\n\\n\n}\n"), ["\n\n", "}"]);
  assert.deepEqual(parseStopSequences(["\n\n"]), ["\n\n"]);
  assert.deepEqual(parseStopSequences(["a", "a", "b"]), ["a", "b"]);
  const many = Array.from({ length: 20 }, (_, index) => `s${index}`);
  assert.equal(parseStopSequences(many).length, 16);
});

test("normalizes stop sequences", () => {
  const settings = normalizeSettings({ stopSequences: ["\\t", "\\t"] });
  assert.deepEqual(settings.stopSequences, ["\t"]);
});

test("parses empty language strings", () => {
  assert.deepEqual(parseLanguages(""), []);
  assert.deepEqual(parseLanguages(" , "), []);
});
