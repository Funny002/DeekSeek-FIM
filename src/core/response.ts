import type { CompletionUsage } from "./types";

export interface ParsedCompletion {
  text: string;
  usage: CompletionUsage;
  finishReason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseCompletionPayload(payload: unknown): ParsedCompletion {
  if (!isRecord(payload)) {
    throw new Error("接口返回了非 JSON 对象。");
  }

  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("接口响应缺少 choices。");
  }

  const first = choices[0];
  if (!isRecord(first)) {
    throw new Error("接口响应中的 choices[0] 无效。");
  }

  let text: string | undefined;
  if (typeof first.text === "string") {
    text = first.text;
  } else if (isRecord(first.message) && typeof first.message.content === "string") {
    text = first.message.content;
  }

  if (text === undefined) {
    throw new Error("接口响应中找不到补全文本（choices[0].text）。");
  }

  const usage: CompletionUsage = {};
  if (isRecord(payload.usage)) {
    usage.promptTokens = readNumber(payload.usage, "prompt_tokens");
    usage.completionTokens = readNumber(payload.usage, "completion_tokens");
    usage.totalTokens = readNumber(payload.usage, "total_tokens");
  }

  const finishReason =
    typeof first.finish_reason === "string" ? first.finish_reason : undefined;
  return { text, usage, finishReason };
}

export function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim().slice(0, 500);
  }
  if (isRecord(payload)) {
    const error = payload.error;
    if (typeof error === "string" && error.trim()) {
      return error.trim().slice(0, 500);
    }
    if (isRecord(error) && typeof error.message === "string") {
      return error.message.slice(0, 500);
    }
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim().slice(0, 500);
    }
  }
  return fallback.trim().slice(0, 500) || "请求失败。";
}
