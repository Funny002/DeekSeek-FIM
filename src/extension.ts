import * as vscode from "vscode";
import { BalanceService } from "./balanceService";
import { getFimSettings, resetFimSettings, updateFimSettings } from "./config";
import {
  resolveChatEndpoint,
  resolveCompletionsEndpoint,
} from "./core/endpoint";
import {
  formatRecentRequests,
  formatUsageStats,
} from "./core/usage";
import { CompletionEngine } from "./engine";
import { FimInlineCompletionProvider } from "./inlineProvider";
import { ModelStore } from "./modelStore";
import { SettingsPanel } from "./settingsPanel";
import { FimStatusBar } from "./statusBar";
import { UsageTracker } from "./usageTracker";

const CONFIG_SECTION = "deepseek-fim";

export interface DeepSeekFimExtensionApi {
  /** Internal hooks exposed only while running extension integration tests. */
  test?: {
    provider: FimInlineCompletionProvider;
    store: ModelStore;
    panel: SettingsPanel;
  };
}

export async function activate(
  context: vscode.ExtensionContext,
): Promise<DeepSeekFimExtensionApi> {
  const output = vscode.window.createOutputChannel("DeepSeek FIM", {
    log: true,
  });
  context.subscriptions.push(output);
  output.info("activating");

  const store = new ModelStore(context);
  await store.initialize();
  const balances = new BalanceService();
  const usage = new UsageTracker(context);
  await usage.initialize();

  const status = new FimStatusBar(
    store,
    () => getFimSettings().enabled,
    () => usage.snapshot(),
  );
  const engine = new CompletionEngine();
  let lastNotificationAt = 0;
  const provider = new FimInlineCompletionProvider({
    store,
    engine,
    getSettings: getFimSettings,
    log: (message) => output.info(message),
    notify: (message, manual) => {
      output.warn(message);
      const authFailure =
        /(401|403|429|unauthorized|invalid api key|密钥|未配置)/i.test(message);
      const now = Date.now();
      if (!manual) {
        if (!authFailure || now - lastNotificationAt < 60_000) {
          return;
        }
      } else if (now - lastNotificationAt < 1200) {
        return;
      }
      lastNotificationAt = now;
      const text =
        message.length > 300 ? `${message.slice(0, 300)}…` : message;
      void vscode.window
        .showWarningMessage(`FIM: ${text}`, "打开设置")
        .then((choice) => {
          if (choice === "打开设置") {
            void panel.reveal();
          }
        });
    },
    onRequestSuccess: (latencyMs, completionTokens, meta) => {
      usage.record({
        type: "success",
        latencyMs,
        completionTokens,
        model: meta.model,
        manual: meta.manual,
      });
      status.recordSuccess(latencyMs, completionTokens);
    },
    onRequestError: (message, meta) => {
      usage.record({
        type: "failure",
        message,
        model: meta.model,
        manual: meta.manual,
      });
      status.recordError(message);
    },
    onRequestStart: () => usage.record({ type: "request" }),
    onCacheHit: (meta) => {
      usage.record({
        type: "cacheHit",
        model: meta.model,
        manual: meta.manual,
      });
      void status.update();
    },
    onRetry: () => {
      usage.record({ type: "retry" });
      void status.update();
    },
  });

  const panel = new SettingsPanel({
    extensionUri: context.extensionUri,
    store,
    getSettings: getFimSettings,
    saveSettings: updateFimSettings,
    resetSettings: resetFimSettings,
    onChanged: async () => {
      status.clearRuntime();
      provider.clearCache();
      await status.update();
    },
    clearCache: () => {
      status.clearRuntime();
      provider.clearCache();
      output.info("completion cache cleared");
    },
    getBalance: (model, apiKey, force) => balances.get(model, apiKey, force),
    log: (message) => output.info(message),
  });

  context.subscriptions.push(panel, status, provider, usage);

  const webviewRegistration = vscode.window.registerWebviewViewProvider(
    SettingsPanel.viewId,
    panel,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    },
  );
  context.subscriptions.push(webviewRegistration);

  const providerRegistration =
    vscode.languages.registerInlineCompletionItemProvider(
      [
        { scheme: "file" },
        { scheme: "untitled" },
        { scheme: "vscode-remote" },
        { scheme: "vscode-vfs" },
        { scheme: "vscode-notebook-cell" },
      ],
      provider,
    );
  context.subscriptions.push(providerRegistration);

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      provider.clearCacheForDocument(document.uri.toString());
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("deepseek-fim.openSettings", async () => {
      await panel.reveal();
    }),
    vscode.commands.registerCommand(
      "deepseek-fim.triggerCompletion",
      async () => {
        if (!vscode.window.activeTextEditor) {
          void vscode.window.showInformationMessage(
            "请先打开一个文件，再手动触发行内补全。",
          );
          return;
        }
        try {
          await vscode.commands.executeCommand(
            "editor.action.inlineSuggest.trigger",
          );
        } catch (error) {
          void vscode.window.showWarningMessage(
            `无法触发行内补全：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    ),
    vscode.commands.registerCommand("deepseek-fim.toggle", async () => {
      const settings = getFimSettings();
      const next = await updateFimSettings({ enabled: !settings.enabled });
      status.clearRuntime();
      provider.clearCache();
      await status.update();
      await panel.refresh();
      void vscode.window.showInformationMessage(
        next.enabled ? "DeepSeek FIM 已启用。" : "DeepSeek FIM 已暂停。",
      );
    }),
    vscode.commands.registerCommand("deepseek-fim.setApiKey", async () => {
      const model = store.getActiveModel();
      if (!model) {
        const choice = await vscode.window.showWarningMessage(
          "请先添加并选择一个模型。",
          "打开设置",
        );
        if (choice === "打开设置") {
          await panel.reveal();
        }
        return;
      }
      const apiKey = await vscode.window.showInputBox({
        password: true,
        ignoreFocusOut: true,
        prompt: `为 ${model.name} 设置 API 密钥`,
        placeHolder: "sk-...",
      });
      if (apiKey === undefined) {
        return;
      }
      if (!apiKey.trim()) {
        void vscode.window.showWarningMessage("API 密钥不能为空。");
        return;
      }
      try {
        await store.upsertModel({ ...model, apiKey: apiKey.trim() });
        status.clearRuntime();
        provider.clearCache();
        await status.update();
        await panel.refresh();
        void vscode.window.showInformationMessage(
          `已保存 ${model.name} 的 API 密钥。`,
        );
      } catch (error) {
        void vscode.window.showErrorMessage(
          `保存 API 密钥失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
    vscode.commands.registerCommand("deepseek-fim.queryBalance", async () => {
      const model = store.getActiveModel();
      if (!model) {
        const choice = await vscode.window.showWarningMessage(
          "请先添加并选择一个模型。",
          "打开设置",
        );
        if (choice === "打开设置") {
          await panel.reveal();
        }
        return;
      }
      if (model.protocol !== "deepseek") {
        void vscode.window.showWarningMessage(
          "余额查询仅适用于 DeepSeek FIM 模型。",
        );
        return;
      }
      const apiKey = await store.getApiKey(model.uid);
      if (!apiKey) {
        const choice = await vscode.window.showWarningMessage(
          "请先设置 DeepSeek API 密钥。",
          "设置 API 密钥",
        );
        if (choice === "设置 API 密钥") {
          await vscode.commands.executeCommand("deepseek-fim.setApiKey");
        }
        return;
      }
      try {
        const balance = await balances.get(model, apiKey, true);
        const amounts =
          balance.balances
            .map((item) => `${item.currency} ${item.totalBalance}`)
            .join(" / ") || "无余额信息";
        const availability = balance.isAvailable ? "可用" : "不可用";
        void vscode.window.showInformationMessage(
          `DeepSeek 账户余额：${amounts}（${availability}）`,
        );
      } catch (error) {
        void vscode.window.showWarningMessage(
          `查询余额失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
    vscode.commands.registerCommand("deepseek-fim.showStats", async () => {
      const stats = usage.snapshot();
      await showReport("DeepSeek FIM 使用统计", [
        ...formatUsageStats(stats),
        "",
        "## 最近请求",
        "",
        ...formatRecentRequests(stats),
      ]);
    }),
    vscode.commands.registerCommand("deepseek-fim.showDiagnostics", async () => {
      const settings = getFimSettings();
      const active = store.getActiveModel();
      const hasKey = active ? await store.hasApiKey(active.uid) : false;
      let endpoint = "—";
      if (active) {
        try {
          endpoint =
            active.protocol === "chat"
              ? resolveChatEndpoint(active.apiUrl)
              : resolveCompletionsEndpoint(active.apiUrl, active.protocol);
        } catch {
          endpoint = active.apiUrl;
        }
      }
      const stats = usage.snapshot();
      await showReport("DeepSeek FIM 诊断", [
        `- 扩展版本：${context.extension.packageJSON.version ?? "unknown"}`,
        `- 启用：${settings.enabled ? "是" : "否"}`,
        `- 模型：${active?.name ?? "未选择"}`,
        `- 模型 ID：${active?.model ?? "—"}`,
        `- 协议：${active?.protocol ?? "—"}`,
        `- 请求地址：${endpoint}`,
        `- 密钥：${hasKey ? "已配置" : "未配置"}`,
        "",
        "## FIM 配置",
        "",
        `- 自动触发：${settings.autoTrigger}`,
        `- 多行：${settings.multiLine}`,
        `- 最大输出 Token：${settings.maxTokens}`,
        `- 上下文行数：${settings.contextLines}`,
        `- 前缀/后缀字符上限：${settings.maxPrefixChars}/${settings.maxSuffixChars}`,
        `- 触发延迟：${settings.debounceMs} ms`,
        `- 随机性 / 核采样：${settings.temperature}/${settings.topP}`,
        `- 重试：${settings.retryCount} 次，间隔 ${settings.retryDelayMs} ms`,
        `- 超时：${settings.requestTimeoutMs} ms`,
        `- 停止词：${settings.stopSequences.join(", ") || "无"}`,
        `- 语言过滤：${settings.languages.join(", ") || "全部"}`,
        "",
        "## 使用统计",
        "",
        ...formatUsageStats(stats),
        "",
        "## 最近请求",
        "",
        ...formatRecentRequests(stats),
      ]);
    }),
    vscode.commands.registerCommand("deepseek-fim.resetStats", async () => {
      await usage.reset();
      await status.update();
      void vscode.window.showInformationMessage("FIM 使用统计已重置。");
    }),
    vscode.commands.registerCommand("deepseek-fim.clearCache", () => {
      status.clearRuntime();
      provider.clearCache();
      output.info("completion cache cleared");
      void vscode.window.showInformationMessage("FIM 补全缓存已清除。");
    }),
  );

  let configTimer: NodeJS.Timeout | undefined;
  const configSubscription = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (!event.affectsConfiguration(CONFIG_SECTION)) {
        return;
      }
      status.clearRuntime();
      provider.clearCache();
      if (configTimer) {
        clearTimeout(configTimer);
      }
      configTimer = setTimeout(() => {
        void status.update();
        void panel.refresh();
      }, 120);
    },
  );
  context.subscriptions.push(configSubscription, {
    dispose: () => {
      if (configTimer) {
        clearTimeout(configTimer);
      }
    },
  });

  await status.update();
  output.info(
    `activated; models=${store.getModels().length} active=${store.getActiveModelId() ?? "none"}`,
  );

  if (context.extensionMode === vscode.ExtensionMode.Test) {
    return { test: { provider, store, panel } };
  }
  return {};
}

export function deactivate(): void {
  // Everything is disposed through the extension context subscriptions.
}

async function showReport(title: string, lines: string[]): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    content: `# ${title}\n\n${lines.join("\n")}`,
    language: "markdown",
  });
  await vscode.window.showTextDocument(document, { preview: true });
}
