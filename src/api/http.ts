import { extractErrorMessage } from "../core/response";
import { FimRequestError } from "./errors";

export interface JsonRequest {
  fetchImpl: typeof fetch;
  endpoint: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * Shared request lifecycle for FIM, Chat, balance and model-list calls:
 * external cancellation, timeout, HTTP error extraction and JSON parsing.
 */
export async function fetchJson(request: JsonRequest): Promise<unknown> {
  const controller = new AbortController();
  const externalSignal = request.signal;
  let externallyAborted = externalSignal?.aborted ?? false;
  let timedOut = false;

  const onAbort = (): void => {
    externallyAborted = true;
    controller.abort();
  };
  if (externalSignal) {
    if (externallyAborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeoutMs);

  try {
    const response = await request.fetchImpl(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const rawBody = await response.text();
    let payload: unknown;
    try {
      payload = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {
      payload = rawBody;
    }

    if (!response.ok) {
      throw new FimRequestError(
        extractErrorMessage(
          payload,
          `HTTP ${response.status} ${response.statusText}`,
        ),
        "http",
        response.status,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof FimRequestError) {
      throw error;
    }
    if (externallyAborted || externalSignal?.aborted) {
      throw new FimRequestError("请求已取消。", "aborted");
    }
    if (timedOut) {
      throw new FimRequestError(
        `请求超时（${request.timeoutMs}ms）。`,
        "timeout",
      );
    }
    throw new FimRequestError(
      error instanceof Error ? error.message : "网络请求失败。",
      "network",
    );
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}
