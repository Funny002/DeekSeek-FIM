import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { FimClient } from "./api/client";
import { ChatClient } from "./api/chatClient";
import { FimRequestError } from "./api/errors";
import { ModelsClient } from "./api/modelsClient";
import type { AccountBalance } from "./core/balance";
import { DEFAULT_SETTINGS, MODEL_PRESETS, getPreset } from "./core/defaults";
import { isLocalEndpoint, validateApiUrl } from "./core/endpoint";
import type { ApiModelInfo } from "./core/models";
import { validateModelDraft } from "./core/model";
import type {
  BalanceView,
  FimSettings,
  ModelConfig,
  ModelDraft,
  ModelPreset,
  PanelState,
  PanelStatus,
} from "./core/types";
import type { ModelStore } from "./modelStore";

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  sample?: string;
  latencyMs?: number;
}

export interface SettingsPanelDeps {
  extensionUri: vscode.Uri;
  store: ModelStore;
  getSettings: () => FimSettings;
  saveSettings: (patch: Partial<FimSettings>) => Promise<FimSettings>;
  resetSettings: () => Promise<FimSettings>;
  onChanged: () => Promise<void>;
  clearCache: () => void;
  getBalance: (
    model: ModelConfig,
    apiKey: string,
    force: boolean,
  ) => Promise<AccountBalance>;
  log: (message: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseDraft(value: unknown): ModelDraft {
  if (!isRecord(value)) {
    throw new Error("模型数据格式不正确。");
  }
  const protocol =
    value.protocol === "deepseek" || value.protocol === "chat"
      ? value.protocol
      : "openai";
  return {
    uid: typeof value.uid === "string" && value.uid ? value.uid : undefined,
    name: typeof value.name === "string" ? value.name : "",
    model: typeof value.model === "string" ? value.model : "",
    apiUrl: typeof value.apiUrl === "string" ? value.apiUrl : "",
    protocol,
    apiKey: typeof value.apiKey === "string" ? value.apiKey : undefined,
    clearApiKey: value.clearApiKey === true,
  };
}

function settingsPatch(value: unknown): Partial<FimSettings> {
  if (!isRecord(value)) {
    return {};
  }
  return value as Partial<FimSettings>;
}

export class SettingsPanel
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  public static readonly viewId = "deepseekFim.settings";
  public static readonly containerId = "deepseekFim";

  private view: vscode.WebviewView | undefined;
  private ready = false;
  private disposed = false;
  private pendingSelectUid: string | undefined;
  private viewDisposables: vscode.Disposable[] = [];
  private readonly client = new FimClient();
  private readonly chatClient = new ChatClient();
  private readonly modelsClient = new ModelsClient();
  private stateVersion = 0;
  private balanceVersion = 0;

  constructor(private readonly deps: SettingsPanelDeps) {}

  get isReady(): boolean {
    return this.ready;
  }

  async reveal(selectUid?: string): Promise<void> {
    this.pendingSelectUid = selectUid;
    try {
      await vscode.commands.executeCommand(
        `workbench.view.extension.${SettingsPanel.containerId}`,
      );
    } catch {
      // The command can be unavailable during startup; the view may still exist.
    }
    this.view?.show?.(true);
    if (this.ready) {
      await this.postState(selectUid);
      this.pendingSelectUid = undefined;
      void this.refreshBalance();
    }
  }

  async refresh(): Promise<void> {
    await this.postState(this.pendingSelectUid);
    void this.refreshBalance();
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.disposeViewListeners();
    this.view = webviewView;
    this.ready = false;
    this.disposed = false;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.deps.extensionUri, "media"),
        vscode.Uri.joinPath(this.deps.extensionUri, "dist"),
      ],
    };

    try {
      webviewView.webview.html = await this.buildHtml(webviewView.webview);
    } catch (error) {
      this.deps.log(`webview html failed: ${errorMessage(error)}`);
      webviewView.webview.html = `<!doctype html><html><body><p>无法加载 FIM 面板：${errorMessage(
        error,
      )}</p></body></html>`;
    }

    this.viewDisposables.push(
      webviewView.webview.onDidReceiveMessage((message: unknown) => {
        void this.handleMessage(message);
      }),
      webviewView.onDidDispose(() => {
        if (this.view === webviewView) {
          this.view = undefined;
          this.ready = false;
        }
      }),
    );
  }

  dispose(): void {
    this.disposed = true;
    this.disposeViewListeners();
  }

  private disposeViewListeners(): void {
    for (const disposable of this.viewDisposables) {
      disposable.dispose();
    }
    this.viewDisposables = [];
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (this.disposed || !isRecord(message) || typeof message.type !== "string") {
      return;
    }
    try {
      switch (message.type) {
        case "ready":
          this.ready = true;
          await this.postState(this.pendingSelectUid);
          this.pendingSelectUid = undefined;
          void this.refreshBalance();
          break;
        case "refresh":
          await this.postState(this.pendingSelectUid);
          void this.refreshBalance();
          break;
        case "refreshBalance":
          await this.refreshBalance(message.force === true);
          break;
        case "saveModel": {
          const saved = await this.deps.store.upsertModel(
            parseDraft(message.draft),
          );
          await this.changed();
          await this.postState(saved.uid);
          void this.refreshBalance();
          await this.toast("success", "模型已保存。");
          break;
        }
        case "addPreset": {
          const key = typeof message.preset === "string" ? message.preset : "";
          if (!getPreset(key as ModelPreset["key"])) {
            throw new Error("未知的模型预设。");
          }
          const result = await this.deps.store.addPreset(
            key as ModelPreset["key"],
          );
          await this.changed();
          await this.postState(result.model.uid);
          void this.refreshBalance();
          if (key === "custom") {
            await this.toast(
              "info",
              "已添加自定义模型，请填写模型 ID 与 API 地址后保存。",
            );
          } else {
            await this.toast(
              result.created ? "success" : "info",
              result.created ? "已添加预设模型。" : "该预设已存在，已切换到对应模型。",
            );
          }
          break;
        }
        case "deleteModel": {
          const uid = typeof message.uid === "string" ? message.uid : "";
          if (!uid) {
            throw new Error("缺少要删除的模型。");
          }
          await this.deps.store.deleteModel(uid);
          await this.changed();
          await this.postState(this.deps.store.getActiveModelId());
          void this.refreshBalance();
          await this.toast("info", "模型已删除。");
          break;
        }
        case "setActive": {
          const uid = typeof message.uid === "string" ? message.uid : "";
          if (!uid) {
            throw new Error("缺少要启用的模型。");
          }
          await this.deps.store.setActiveModel(uid);
          await this.changed();
          await this.postState(uid);
          void this.refreshBalance();
          await this.toast("success", "已切换当前模型。");
          break;
        }
        case "updateSettings": {
          await this.deps.saveSettings(settingsPatch(message.settings));
          await this.changed();
          await this.postState(this.pendingSelectUid);
          await this.toast("success", "FIM 设置已保存。");
          break;
        }
        case "setEnabled": {
          const enabled = message.enabled === true;
          await this.deps.saveSettings({ enabled });
          await this.changed();
          await this.postState(this.pendingSelectUid);
          await this.toast(
            "info",
            enabled ? "行内补全已启用。" : "行内补全已暂停。",
          );
          break;
        }
        case "resetSettings": {
          await this.deps.resetSettings();
          await this.changed();
          await this.postState(this.pendingSelectUid);
          await this.toast("info", "已恢复默认 FIM 设置。");
          break;
        }
        case "clearCache":
          this.deps.clearCache();
          await this.toast("info", "补全缓存已清除。");
          break;
        case "testModel": {
          const result = await this.testConnection(message.draft);
          await this.post({ type: "testResult", result });
          break;
        }
        case "listModels": {
          const result = await this.listModels(message.draft);
          await this.post({ type: "models", ...result });
          break;
        }
        default:
          this.deps.log(`unknown panel message: ${message.type}`);
      }
    } catch (error) {
      this.deps.log(`panel error (${message.type}): ${errorMessage(error)}`);
      await this.toast("error", errorMessage(error));
    }
  }

  private async refreshBalance(force = false): Promise<void> {
    if (!this.ready || this.disposed) {
      return;
    }
    const version = ++this.balanceVersion;
    const model = this.deps.store.getActiveModel();
    if (!model || model.protocol !== "deepseek") {
      await this.postBalance({ supported: false });
      return;
    }

    const apiKey = await this.deps.store.getApiKey(model.uid);
    if (version !== this.balanceVersion) {
      return;
    }
    if (!apiKey) {
      await this.postBalance({
        supported: true,
        error: "未配置 API 密钥。",
      });
      return;
    }

    await this.postBalance({ supported: true, loading: true });
    try {
      const balance = await this.deps.getBalance(model, apiKey, force);
      if (
        version !== this.balanceVersion ||
        this.deps.store.getActiveModel()?.uid !== model.uid
      ) {
        return;
      }
      await this.postBalance({ supported: true, data: balance });
    } catch (error) {
      if (version !== this.balanceVersion) {
        return;
      }
      const message = errorMessage(error);
      this.deps.log(`balance query failed: ${message}`);
      await this.postBalance({ supported: true, error: message });
    }
  }

  private async postBalance(view: BalanceView): Promise<void> {
    await this.post({ type: "balance", ...view });
  }

  private async listModels(
    value: unknown,
  ): Promise<{ models?: ApiModelInfo[]; error?: string }> {
    try {
      const draft = parseDraft(value);
      validateApiUrl(draft.apiUrl);
      const storedKey =
        draft.uid ? await this.deps.store.getApiKey(draft.uid) : undefined;
      const typedKey =
        draft.apiKey && draft.apiKey.trim() ? draft.apiKey.trim() : undefined;
      const apiKey = draft.clearApiKey ? typedKey : typedKey || storedKey;
      const keyRequired =
        draft.protocol === "deepseek" ||
        (draft.protocol === "chat" && !isLocalEndpoint(draft.apiUrl));
      if (!apiKey && keyRequired) {
        return { error: "当前接口的模型列表需要 API 密钥。" };
      }

      const models = await this.modelsClient.list(draft.apiUrl, apiKey);
      this.deps.log(`model list loaded: ${models.length} models`);
      return { models };
    } catch (error) {
      if (error instanceof FimRequestError) {
        return { error: error.message };
      }
      return { error: errorMessage(error) };
    }
  }

  private async testConnection(value: unknown): Promise<TestConnectionResult> {
    try {
      const draft = parseDraft(value);
      const validated = validateModelDraft(draft);
      const storedKey =
        validated.uid ? await this.deps.store.getApiKey(validated.uid) : undefined;
      const typedKey =
        draft.apiKey && draft.apiKey.trim() ? draft.apiKey.trim() : undefined;
      const apiKey = draft.clearApiKey ? typedKey : typedKey || storedKey;
      const keyRequired =
        validated.protocol === "deepseek" ||
        (validated.protocol === "chat" && !isLocalEndpoint(validated.apiUrl));
      if (keyRequired && !apiKey) {
        return {
          ok: false,
          message: "当前模型需要 API 密钥，请先填写密钥。",
        };
      }

      const request = {
        model: {
          uid: validated.uid ?? "connection-test",
          name: validated.name,
          model: validated.model,
          apiUrl: validated.apiUrl,
          protocol: validated.protocol,
        },
        apiKey,
        prompt: "// FIM connection test\nfunction add(a, b) {\n  return ",
        suffix: ";\n}\n",
        maxTokens: 32,
        temperature: 0,
        topP: 1,
        timeoutMs: 20_000,
      };
      const response =
        validated.protocol === "chat"
          ? await this.chatClient.complete(request)
          : await this.client.complete(request);
      const sample = response.text.replace(/\r/g, "").trim().slice(0, 200);
      if (!sample) {
        return {
          ok: false,
          message: "连接成功，但模型返回了空补全。",
          latencyMs: response.latencyMs,
        };
      }
      this.deps.log(
        `connection test ok model=${validated.model} latency=${response.latencyMs}ms`,
      );
      return {
        ok: true,
        message: `连接成功，耗时 ${response.latencyMs} ms。`,
        sample,
        latencyMs: response.latencyMs,
      };
    } catch (error) {
      if (error instanceof FimRequestError) {
        return { ok: false, message: error.message };
      }
      return { ok: false, message: errorMessage(error) };
    }
  }

  private async changed(): Promise<void> {
    await this.deps.onChanged();
  }

  private async buildState(selectedUid?: string): Promise<PanelState> {
    const models = this.deps.store.getModels();
    const activeId = this.deps.store.getActiveModelId();
    const publicModels = [];
    for (const model of models) {
      publicModels.push({
        ...model,
        hasApiKey: await this.deps.store.hasApiKey(model.uid),
        isActive: model.uid === activeId,
      });
    }

    const settings = this.deps.getSettings();
    const active = models.find((model) => model.uid === activeId);
    const activeHasKey = active
      ? publicModels.find((model) => model.uid === active.uid)?.hasApiKey === true
      : false;

    let statusMessage = "尚未选择模型。";
    let ready = false;
    if (!settings.enabled) {
      statusMessage = "行内补全已暂停。";
    } else if (!active) {
      statusMessage = "尚未选择模型。";
    } else if (!active.model.trim() || !active.apiUrl.trim()) {
      statusMessage = "当前模型配置不完整。";
    } else if (
      !activeHasKey &&
      (active.protocol === "deepseek" || !isLocalEndpoint(active.apiUrl))
    ) {
      statusMessage = "未配置 API 密钥。";
    } else if (!activeHasKey) {
      statusMessage = `就绪 · ${active.name}（本地服务，无需密钥）`;
      ready = true;
    } else {
      statusMessage = `就绪 · ${active.name}`;
      ready = true;
    }

    const status: PanelStatus = {
      ready,
      enabled: settings.enabled,
      activeModelName: active?.name,
      message: statusMessage,
    };

    return {
      models: publicModels,
      activeModelId: activeId,
      settings,
      presets: MODEL_PRESETS,
      defaults: DEFAULT_SETTINGS,
      status,
      selectedUid: selectedUid ?? activeId,
    };
  }

  private async postState(selectedUid?: string): Promise<void> {
    if (!this.ready || !this.view || this.disposed) {
      return;
    }
    const version = ++this.stateVersion;
    const state = await this.buildState(selectedUid);
    if (version !== this.stateVersion || !this.ready || !this.view) {
      return;
    }
    await this.post({ type: "state", state });
  }

  private async post(message: unknown): Promise<void> {
    if (!this.view || this.disposed) {
      return;
    }
    await this.view.webview.postMessage(message);
  }

  private async toast(
    level: "info" | "success" | "error",
    message: string,
  ): Promise<void> {
    await this.post({ type: "toast", level, message });
  }

  private async buildHtml(webview: vscode.Webview): Promise<string> {
    const nonce = randomBytes(16).toString("base64");
    const htmlPath = vscode.Uri.joinPath(
      this.deps.extensionUri,
      "media",
      "index.html",
    );
    const bytes = await vscode.workspace.fs.readFile(htmlPath);
    const source = Buffer.from(bytes).toString("utf8");
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, "media", "style.css"),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, "media", "main.js"),
    );
    return source
      .replace(/\{\{cspSource\}\}/g, webview.cspSource)
      .replace(/\{\{nonce\}\}/g, nonce)
      .replace(/\{\{styleUri\}\}/g, styleUri.toString())
      .replace(/\{\{scriptUri\}\}/g, scriptUri.toString());
  }
}
