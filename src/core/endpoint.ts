import type { FimProtocol } from "./types";

export function validateApiUrl(raw: string): URL {
  const value = raw.trim();
  if (!value) {
    throw new Error("请填写 API 地址。");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("API 地址不是合法的 URL。");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API 地址只支持 http:// 或 https://。");
  }
  return url;
}

export function isLocalEndpoint(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]" ||
      host === "0.0.0.0" ||
      /^127\./.test(host) ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/**
 * Accepts either a base URL or a full /completions endpoint and resolves it
 * according to the selected protocol.
 */
export function resolveCompletionsEndpoint(
  raw: string,
  protocol: FimProtocol,
): string {
  const url = validateApiUrl(raw);
  url.hash = "";
  let pathname = url.pathname.replace(/\/+$/, "");

  // DeepSeek's OpenAI-compatible base URL is https://api.deepseek.com, while
  // FIM is only exposed under /beta. Normalize common /v1 or root inputs so
  // the DeepSeek protocol always reaches the FIM endpoint.
  if (protocol === "deepseek" && url.hostname.toLowerCase() === "api.deepseek.com") {
    url.pathname = "/beta/completions";
    return url.toString();
  }

  if (/\/completions$/i.test(pathname)) {
    url.pathname = pathname;
    return url.toString();
  }

  if (protocol === "deepseek") {
    if (!pathname || pathname === "/") {
      pathname = "/beta/completions";
    } else if (/\/beta$/i.test(pathname)) {
      pathname += "/completions";
    } else if (/\/v\d+[a-z]*$/i.test(pathname)) {
      pathname += "/completions";
    } else {
      pathname += "/completions";
    }
  } else if (/\/v\d+[a-z]*$/i.test(pathname) || /\/beta$/i.test(pathname)) {
    pathname += "/completions";
  } else {
    pathname += "/v1/completions";
  }

  url.pathname = pathname;
  return url.toString();
}

/**
 * Resolves a chat completion endpoint. Chat mode is a fallback for providers
 * that do not implement FIM /completions.
 */
export function resolveChatEndpoint(raw: string): string {
  const url = validateApiUrl(raw);
  url.hash = "";
  let pathname = url.pathname.replace(/\/+$/, "");

  if (/\/chat\/completions$/i.test(pathname)) {
    url.pathname = pathname;
    return url.toString();
  }

  if (url.hostname.toLowerCase() === "api.deepseek.com") {
    url.pathname = "/chat/completions";
    return url.toString();
  }

  pathname = pathname.replace(/\/completions$/i, "");
  if (!pathname || pathname === "/") {
    pathname = "/v1";
  }
  url.pathname = `${pathname}/chat/completions`;
  return url.toString();
}
