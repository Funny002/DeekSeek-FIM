import * as vscode from "vscode";
import { isLocalEndpoint } from "./core/endpoint";
import { averageLatency, type UsageStats } from "./core/usage";
import type { ModelStore } from "./modelStore";

export class FimStatusBar {
  private readonly item: vscode.StatusBarItem;
  private lastError: string | undefined;
  private lastLatencyMs: number | undefined;
  private lastTokens: number | undefined;

  constructor(
    private readonly store: ModelStore,
    private readonly getEnabled: () => boolean,
    private readonly getUsage: () => UsageStats,
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.command = "deepseek-fim.openSettings";
    this.item.show();
  }

  recordSuccess(latencyMs: number, completionTokens?: number): void {
    this.lastError = undefined;
    this.lastLatencyMs = latencyMs;
    this.lastTokens = completionTokens;
    void this.update();
  }

  recordError(message: string): void {
    this.lastError = message.slice(0, 300);
    void this.update();
  }

  clearRuntime(): void {
    this.lastError = undefined;
    this.lastLatencyMs = undefined;
    this.lastTokens = undefined;
  }

  async update(): Promise<void> {
    const enabled = this.getEnabled();
    const model = this.store.getActiveModel();

    if (!enabled) {
      this.item.text = "$(circle-slash) FIM 已暂停";
      this.item.tooltip = "DeepSeek FIM 已暂停。点击打开设置。";
      this.item.backgroundColor = undefined;
      return;
    }
    if (!model) {
      this.item.text = "$(warning) FIM 未配置";
      this.item.tooltip = "还没有选择模型。点击打开 FIM 设置。";
      this.item.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
      return;
    }

    const hasKey = await this.store.hasApiKey(model.uid);
    const missingKey =
      !hasKey &&
      (model.protocol === "deepseek" || !isLocalEndpoint(model.apiUrl));
    if (this.lastError) {
      this.item.text = "$(warning) FIM";
      this.item.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
    } else if (missingKey) {
      this.item.text = "$(warning) FIM 无密钥";
      this.item.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
    } else {
      this.item.text = "$(sparkle) FIM";
      this.item.backgroundColor = undefined;
    }

    const lines = [
      "**DeepSeek FIM**",
      "",
      `模型：${model.name}`,
      `模型 ID：\`${model.model}\``,
      `密钥：${
        hasKey
          ? "已配置"
          : isLocalEndpoint(model.apiUrl)
            ? "未配置（本地服务可忽略）"
            : "未配置"
      }`,
    ];
    if (this.lastLatencyMs !== undefined) {
      const tokenInfo =
        this.lastTokens !== undefined ? ` · ${this.lastTokens} Token` : "";
      lines.push(`最近补全：${this.lastLatencyMs} ms${tokenInfo}`);
    }
    if (this.lastError) {
      lines.push("", `**最近错误：** ${this.lastError}`);
    }

    const usage = this.getUsage();
    if (usage.requests > 0 || usage.cacheHits > 0) {
      const average = averageLatency(usage);
      lines.push(
        "",
        `请求：${usage.requests} · 成功：${usage.successes} · 失败：${usage.failures}`,
        `缓存命中：${usage.cacheHits} · 重试：${usage.retries} · Token：${usage.completionTokens}`,
      );
      if (average !== undefined) {
        lines.push(`平均延迟：${average} ms`);
      }
    }
    lines.push("", "点击打开模型与 FIM 设置。");
    this.item.tooltip = new vscode.MarkdownString(lines.join("\n"));
  }

  dispose(): void {
    this.item.dispose();
  }
}
