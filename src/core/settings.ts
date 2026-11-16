import { DEFAULT_SETTINGS } from "./defaults";
import type { FimSettings } from "./types";

export const SETTINGS_SECTION = "deepseek-fim";

type RawSettings = Partial<Record<keyof FimSettings, unknown>>;

function numberInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const bounded = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(bounded) : Math.round(bounded * 10000) / 10000;
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseLanguages(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") {
      continue;
    }
    const language = part.trim().toLowerCase();
    if (!language || seen.has(language)) {
      continue;
    }
    seen.add(language);
    result.push(language);
    if (result.length >= 32) {
      break;
    }
  }
  return result;
}

function decodeStopSequence(value: string): string {
  return value.replace(/\\(n|r|t|\\)/g, (_, escaped: string) => {
    if (escaped === "n") {
      return "\n";
    }
    if (escaped === "r") {
      return "\r";
    }
    if (escaped === "t") {
      return "\t";
    }
    return "\\";
  });
}

export function parseStopSequences(value: unknown): string[] {
  const fromArray = Array.isArray(value);
  const parts = fromArray
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") {
      continue;
    }
    const raw = fromArray ? part : part.trim();
    if (!raw) {
      continue;
    }
    const sequence = decodeStopSequence(raw).slice(0, 64);
    if (!sequence || seen.has(sequence)) {
      continue;
    }
    seen.add(sequence);
    result.push(sequence);
    if (result.length >= 16) {
      break;
    }
  }
  return result;
}

export function normalizeSettings(
  input: RawSettings,
  base: FimSettings = DEFAULT_SETTINGS,
): FimSettings {
  return {
    enabled: boolValue(input.enabled, base.enabled),
    autoTrigger: boolValue(input.autoTrigger, base.autoTrigger),
    multiLine: boolValue(input.multiLine, base.multiLine),
    debounceMs: numberInRange(input.debounceMs, base.debounceMs, 0, 2000, true),
    maxTokens: numberInRange(input.maxTokens, base.maxTokens, 1, 4096, true),
    contextLines: numberInRange(input.contextLines, base.contextLines, 0, 200, true),
    maxPrefixChars: numberInRange(
      input.maxPrefixChars,
      base.maxPrefixChars,
      200,
      20000,
      true,
    ),
    maxSuffixChars: numberInRange(
      input.maxSuffixChars,
      base.maxSuffixChars,
      0,
      20000,
      true,
    ),
    temperature: numberInRange(input.temperature, base.temperature, 0, 2),
    topP: numberInRange(input.topP, base.topP, 0.001, 1),
    stopSequences: input.stopSequences === undefined
      ? [...base.stopSequences]
      : parseStopSequences(input.stopSequences),
    retryCount: numberInRange(input.retryCount, base.retryCount, 0, 2, true),
    retryDelayMs: numberInRange(
      input.retryDelayMs,
      base.retryDelayMs,
      0,
      2000,
      true,
    ),
    requestTimeoutMs: numberInRange(
      input.requestTimeoutMs,
      base.requestTimeoutMs,
      1000,
      60000,
      true,
    ),
    languages: input.languages === undefined
      ? [...base.languages]
      : parseLanguages(input.languages),
  };
}

/**
 * Reads settings through a callback so this module stays independent from
 * the VS Code API and easy to exercise in unit tests.
 */
export function readSettings(
  get: (key: keyof FimSettings, fallback: unknown) => unknown,
): FimSettings {
  return normalizeSettings({
    enabled: get("enabled", DEFAULT_SETTINGS.enabled),
    autoTrigger: get("autoTrigger", DEFAULT_SETTINGS.autoTrigger),
    multiLine: get("multiLine", DEFAULT_SETTINGS.multiLine),
    debounceMs: get("debounceMs", DEFAULT_SETTINGS.debounceMs),
    maxTokens: get("maxTokens", DEFAULT_SETTINGS.maxTokens),
    contextLines: get("contextLines", DEFAULT_SETTINGS.contextLines),
    maxPrefixChars: get("maxPrefixChars", DEFAULT_SETTINGS.maxPrefixChars),
    maxSuffixChars: get("maxSuffixChars", DEFAULT_SETTINGS.maxSuffixChars),
    temperature: get("temperature", DEFAULT_SETTINGS.temperature),
    topP: get("topP", DEFAULT_SETTINGS.topP),
    stopSequences: get("stopSequences", DEFAULT_SETTINGS.stopSequences),
    retryCount: get("retryCount", DEFAULT_SETTINGS.retryCount),
    retryDelayMs: get("retryDelayMs", DEFAULT_SETTINGS.retryDelayMs),
    requestTimeoutMs: get(
      "requestTimeoutMs",
      DEFAULT_SETTINGS.requestTimeoutMs,
    ),
    languages: get("languages", DEFAULT_SETTINGS.languages.join(",")),
  });
}

export function settingsToConfig(settings: FimSettings): Record<string, unknown> {
  return {
    enabled: settings.enabled,
    autoTrigger: settings.autoTrigger,
    multiLine: settings.multiLine,
    debounceMs: settings.debounceMs,
    maxTokens: settings.maxTokens,
    contextLines: settings.contextLines,
    maxPrefixChars: settings.maxPrefixChars,
    maxSuffixChars: settings.maxSuffixChars,
    temperature: settings.temperature,
    topP: settings.topP,
    stopSequences: [...settings.stopSequences],
    retryCount: settings.retryCount,
    retryDelayMs: settings.retryDelayMs,
    requestTimeoutMs: settings.requestTimeoutMs,
    languages: settings.languages.join(","),
  };
}
