import * as vscode from "vscode";
import { FimRequestError } from "./api/errors";
import { isRetryableError, retryDelay } from "./api/retry";
import { isLocalEndpoint } from "./core/endpoint";
import type { CompletionResult } from "./core/types";
import type { CompletionEngine, EngineRequest } from "./engine";
import type { FimSettings } from "./core/types";
import type { ModelStore } from "./modelStore";

interface CachedCompletion {
  text: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 45_000;
const CACHE_LIMIT = 80;
const MAX_DOCUMENT_CHARS = 2_000_000;

const ALLOWED_SCHEMES = new Set([
  "file",
  "untitled",
  "vscode-remote",
  "vscode-vfs",
  "vscode-notebook-cell",
]);

function wait(ms: number, token: vscode.CancellationToken): Promise<void> {
  if (ms <= 0 || token.isCancellationRequested) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancellation: vscode.Disposable | undefined;
    const finish = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      if (timer) {
        clearTimeout(timer);
      }
      cancellation?.dispose();
      resolve();
    };
    timer = setTimeout(finish, ms);
    cancellation = token.onCancellationRequested(finish);
    if (token.isCancellationRequested) {
      finish();
    }
  });
}

function settingsFingerprint(settings: FimSettings, modelUid: string): string {
  return [
    modelUid,
    settings.maxTokens,
    settings.contextLines,
    settings.maxPrefixChars,
    settings.maxSuffixChars,
    settings.temperature,
    settings.topP,
    settings.stopSequences.join("\u0000"),
    settings.multiLine,
  ].join("|");
}

export interface RequestMeta {
  model: string;
  manual: boolean;
}

export interface InlineProviderDeps {
  store: ModelStore;
  engine: CompletionEngine;
  getSettings: () => FimSettings;
  log: (message: string) => void;
  notify: (message: string, manual: boolean) => void;
  onRequestSuccess: (
    latencyMs: number,
    completionTokens: number | undefined,
    meta: RequestMeta,
  ) => void;
  onRequestError: (message: string, meta: RequestMeta) => void;
  onRequestStart?: (meta: RequestMeta) => void;
  onCacheHit?: (meta: RequestMeta) => void;
  onRetry?: (attempt: number) => void;
}

export class FimInlineCompletionProvider
  implements vscode.InlineCompletionItemProvider, vscode.Disposable
{
  private readonly cache = new Map<string, CachedCompletion>();
  private activeAbort: AbortController | undefined;
  private cooldownUntil = 0;
  private failureCount = 0;

  constructor(private readonly deps: InlineProviderDeps) {}

  clearCache(): void {
    this.cache.clear();
    this.cooldownUntil = 0;
    this.failureCount = 0;
    this.activeAbort?.abort();
    this.activeAbort = undefined;
  }

  clearCacheForDocument(uri: string): void {
    const prefix = `${uri}|`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  dispose(): void {
    this.clearCache();
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {
    const settings = this.deps.getSettings();
    const manual = context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;

    if (!settings.enabled) {
      return [];
    }
    if (!settings.autoTrigger && !manual) {
      return [];
    }
    if (!ALLOWED_SCHEMES.has(document.uri.scheme)) {
      return [];
    }
    if (
      settings.languages.length > 0 &&
      !settings.languages.includes(document.languageId.toLowerCase())
    ) {
      return [];
    }

    const model = this.deps.store.getActiveModel();
    if (!model) {
      if (manual) {
        this.deps.notify("还没有选择模型，请先在 FIM 面板中添加模型。", true);
      }
      return [];
    }
    if (!model.model.trim() || !model.apiUrl.trim()) {
      if (manual) {
        this.deps.notify("当前模型缺少模型 ID 或 API 地址，请先在面板中补全。", true);
      }
      return [];
    }

    const apiKey = await this.deps.store.getApiKey(model.uid);
    const keyRequired =
      model.protocol === "deepseek" ||
      (model.protocol === "chat" && !isLocalEndpoint(model.apiUrl));
    if (!apiKey && keyRequired) {
      if (manual) {
        this.deps.notify("当前接口需要 API 密钥，请先在面板中填写。", true);
      }
      return [];
    }
    if (token.isCancellationRequested) {
      return [];
    }

    const fingerprint = settingsFingerprint(settings, model.uid);
    const cacheKey = [
      document.uri.toString(),
      document.version,
      position.line,
      position.character,
      fingerprint,
    ].join("|");
    if (!manual) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        this.deps.onCacheHit?.({ model: model.model, manual });
        return [
          new vscode.InlineCompletionItem(
            cached.text,
            new vscode.Range(position, position),
          ),
        ];
      }
      if (cached) {
        this.cache.delete(cacheKey);
      }
    }

    if (!manual && this.cooldownUntil > Date.now()) {
      const remaining = this.cooldownUntil - Date.now();
      this.deps.log(`auto completion throttled for ${remaining}ms`);
      return [];
    }

    if (!manual) {
      await wait(settings.debounceMs, token);
    }
    if (token.isCancellationRequested) {
      return [];
    }

    const version = document.version;
    const offset = document.offsetAt(position);
    const text = document.getText();
    if (document.version !== version) {
      return [];
    }
    if (text.length > MAX_DOCUMENT_CHARS) {
      if (manual) {
        this.deps.notify("当前文件过大，已跳过行内补全。", true);
      }
      return [];
    }

    this.activeAbort?.abort();
    const controller = new AbortController();
    this.activeAbort = controller;
    const cancellation = token.onCancellationRequested(() => controller.abort());
    const meta: RequestMeta = { model: model.model, manual };

    try {
      this.deps.onRequestStart?.(meta);
      const result = await this.completeWithRetry(
        {
          text,
          offset,
          eol: document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n",
          model,
          apiKey,
          settings,
          signal: controller.signal,
        },
        settings,
        token,
      );
      if (
        token.isCancellationRequested ||
        !result ||
        document.version !== version
      ) {
        return [];
      }
      if (
        result.finishReason === "content_filter" ||
        result.finishReason === "insufficient_system_resource" ||
        result.finishReason === "aborted"
      ) {
        const message =
          result.finishReason === "content_filter"
            ? "模型因内容过滤未返回补全。"
            : `模型未完成补全（${result.finishReason}）。`;
        this.deps.log(`completion incomplete model=${model.model}: ${message}`);
        this.deps.onRequestError(message, meta);
        if (manual) {
          this.deps.notify(message, true);
        }
        return [];
      }

      this.deps.onRequestSuccess(
        result.latencyMs,
        result.usage.completionTokens,
        meta,
      );
      this.cooldownUntil = 0;
      this.failureCount = 0;
      this.deps.log(
        `completion ok model=${model.model} latency=${result.latencyMs}ms ` +
          `Token=${result.usage.completionTokens ?? "?"} ` +
          `finish=${result.finishReason ?? "unknown"} ` +
          `context=${result.prefixChars}+${result.suffixChars} chars`,
      );
      this.cache.set(cacheKey, {
        text: result.text,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      this.trimCache();

      return [
        new vscode.InlineCompletionItem(
          result.text,
          new vscode.Range(position, position),
        ),
      ];
    } catch (error) {
      if (
        token.isCancellationRequested ||
        (error instanceof FimRequestError && error.kind === "aborted")
      ) {
        return [];
      }
      const message = error instanceof Error ? error.message : String(error);
      this.registerFailure(error);
      this.deps.log(`completion failed model=${model.model}: ${message}`);
      this.deps.onRequestError(message, meta);
      this.deps.notify(message, manual);
      return [];
    } finally {
      if (this.activeAbort === controller) {
        this.activeAbort = undefined;
      }
      cancellation.dispose();
    }
  }

  private async completeWithRetry(
    request: EngineRequest,
    settings: FimSettings,
    token: vscode.CancellationToken,
  ): Promise<CompletionResult | null> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.deps.engine.complete(request);
      } catch (error) {
        if (
          token.isCancellationRequested ||
          attempt >= settings.retryCount ||
          !isRetryableError(error)
        ) {
          throw error;
        }
        attempt += 1;
        const delay = retryDelay(settings.retryDelayMs, attempt);
        this.deps.log(
          `completion retry ${attempt}/${settings.retryCount} in ${delay}ms`,
        );
        this.deps.onRetry?.(attempt);
        await wait(delay, token);
        if (token.isCancellationRequested) {
          throw new FimRequestError("请求已取消。", "aborted");
        }
      }
    }
  }

  private registerFailure(error: unknown): void {
    this.failureCount += 1;
    let baseCooldown = 5_000;
    if (error instanceof FimRequestError) {
      if (error.kind === "timeout" || error.kind === "network") {
        baseCooldown = 5_000;
      } else if (error.kind === "http") {
        if (error.status === 401 || error.status === 403) {
          baseCooldown = 60_000;
        } else if (error.status === 402) {
          baseCooldown = 30_000;
        } else if (error.status === 429) {
          baseCooldown = 15_000;
        } else if (error.status !== undefined && error.status >= 500) {
          baseCooldown = 10_000;
        } else {
          baseCooldown = 30_000;
        }
      } else if (error.kind === "invalid") {
        baseCooldown = 30_000;
      }
    }

    const multiplier = Math.min(2 ** (this.failureCount - 1), 8);
    const cooldown = Math.min(baseCooldown * multiplier, 120_000);
    this.cooldownUntil = Date.now() + cooldown;
    this.deps.log(
      `auto completion cooling down ${cooldown}ms ` +
        `(failures=${this.failureCount})`,
    );
  }

  private trimCache(): void {
    if (this.cache.size <= CACHE_LIMIT) {
      return;
    }
    const now = Date.now();
    for (const [key, value] of this.cache) {
      if (value.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) {
        break;
      }
      this.cache.delete(oldest);
    }
  }
}
