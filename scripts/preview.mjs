import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const mediaDir = join(root, "media");
const port = Number(process.env.PORT || 4173);

const settings = {
  enabled: true,
  autoTrigger: true,
  multiLine: true,
  debounceMs: 180,
  maxTokens: 128,
  contextLines: 30,
  maxPrefixChars: 3000,
  maxSuffixChars: 1500,
  temperature: 0.2,
  topP: 1,
  stopSequences: [],
  retryCount: 1,
  retryDelayMs: 300,
  requestTimeoutMs: 12000,
  languages: [],
};

const balance = {
  isAvailable: true,
  balances: [
    {
      currency: "CNY",
      totalBalance: "42.18",
      grantedBalance: "2.00",
      toppedUpBalance: "40.18",
    },
  ],
  fetchedAt: Date.now(),
};

const models = [
  {
    uid: "deepseek",
    name: "DeepSeek FIM · Flash",
    model: "deepseek-flash",
    apiUrl: "https://api.deepseek.com/beta/completions",
    protocol: "deepseek",
    hasApiKey: false,
    isActive: true,
  },
  {
    uid: "qwen",
    name: "Qwen2.5 Coder · 硅基流动",
    model: "Qwen/Qwen2.5-Coder-7B-Instruct",
    apiUrl: "https://api.siliconflow.cn/v1/completions",
    protocol: "openai",
    hasApiKey: true,
    isActive: false,
  },
  {
    uid: "ollama",
    name: "Qwen2.5 Coder · Ollama",
    model: "qwen2.5-coder:7b",
    apiUrl: "http://127.0.0.1:11434/v1/completions",
    protocol: "openai",
    hasApiKey: false,
    isActive: false,
  },
];

const presets = [
  {
    key: "deepseek",
    label: "DeepSeek FIM Flash（推荐）",
    description: "DeepSeek 官方 FIM Beta 接口。",
    name: "DeepSeek FIM · Flash",
    model: "deepseek-flash",
    apiUrl: "https://api.deepseek.com/beta/completions",
    protocol: "deepseek",
  },
  {
    key: "deepseek-pro",
    label: "DeepSeek FIM V4 Pro",
    description: "DeepSeek FIM Beta 的高质量模型。",
    name: "DeepSeek FIM · V4 Pro",
    model: "deepseek-v4-pro",
    apiUrl: "https://api.deepseek.com/beta/completions",
    protocol: "deepseek",
  },
  {
    key: "siliconflow",
    label: "Qwen Coder · 硅基流动",
    description: "OpenAI 兼容 /completions。",
    name: "Qwen2.5 Coder · 硅基流动",
    model: "Qwen/Qwen2.5-Coder-7B-Instruct",
    apiUrl: "https://api.siliconflow.cn/v1/completions",
    protocol: "openai",
  },
  {
    key: "ollama",
    label: "Qwen Coder · Ollama 本地",
    description: "本机 OpenAI 兼容接口。",
    name: "Qwen2.5 Coder · Ollama",
    model: "qwen2.5-coder:7b",
    apiUrl: "http://127.0.0.1:11434/v1/completions",
    protocol: "openai",
  },
  {
    key: "custom",
    label: "自定义模型",
    description: "手动填写任意 FIM 接口。",
    name: "自定义模型",
    model: "",
    apiUrl: "",
    protocol: "openai",
  },
];

function status() {
  const active = models.find((model) => model.isActive);
  let ready = false;
  let tone = "warn";
  let message = "尚未选择模型。";
  if (!settings.enabled) {
    tone = "off";
    message = "行内补全已暂停。";
  } else if (!active) {
    message = "尚未选择模型。";
  } else if (!active.model || !active.apiUrl) {
    message = "当前模型配置不完整。";
  } else if (active.protocol === "deepseek" && !active.hasApiKey) {
    message = "未配置 API 密钥。";
  } else {
    ready = true;
    tone = "ready";
    message = active.hasApiKey
      ? `就绪 · ${active.name}`
      : `就绪 · ${active.name}（本地服务，无需密钥）`;
  }
  return {
    ready,
    enabled: settings.enabled,
    activeModelName: active?.name,
    message,
    tone,
  };
}

function state(selectedUid) {
  return {
    models,
    activeModelId: models.find((model) => model.isActive)?.uid,
    settings,
    presets,
    defaults: { ...settings },
    status: status(),
    selectedUid:
      selectedUid ||
      models.find((model) => model.isActive)?.uid ||
      models[0]?.uid,
  };
}

const previewCss = `
:root {
  --vscode-font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
  --vscode-font-size: 13px;
  --vscode-editor-font-family: "Cascadia Code", Consolas, monospace;
  --vscode-foreground: #cccccc;
  --vscode-sideBar-background: #181818;
  --vscode-editor-background: #1f1f1f;
  --vscode-editorWidget-background: #202020;
  --vscode-widget-border: #3c3c3c;
  --vscode-input-background: #313131;
  --vscode-input-foreground: #cccccc;
  --vscode-input-border: #3c3c3c;
  --vscode-input-placeholderForeground: #8b8b8b;
  --vscode-button-background: #0078d4;
  --vscode-button-foreground: #ffffff;
  --vscode-button-secondaryBackground: #313131;
  --vscode-button-secondaryForeground: #cccccc;
  --vscode-button-secondaryHoverBackground: #3c3c3c;
  --vscode-focusBorder: #0078d4;
  --vscode-textLink-foreground: #4daafc;
  --vscode-textLink-activeForeground: #6fbaff;
  --vscode-descriptionForeground: #9d9d9d;
  --vscode-list-hoverBackground: #2a2d2e;
  --vscode-list-inactiveSelectionBackground: #37373d;
  --vscode-textCodeBlock-background: #2b2b2b;
  --vscode-keybindingLabel-background: #2b2b2b;
  --vscode-testing-iconPassed: #73c991;
  --vscode-editorWarning-foreground: #cca700;
  --vscode-errorForeground: #f85149;
  --vscode-notifications-background: #202020;
  --vscode-notifications-foreground: #cccccc;
  --vscode-notificationsInfoIcon-foreground: #3794ff;
  --vscode-terminal-ansiGreen: #23d18b;
  --vscode-disabledForeground: #7f7f7f;
}
html, body { background: #181818; }
`;

const handlers = `
  const state = ${JSON.stringify({ models, settings, presets, defaults: settings })};
  const balance = ${JSON.stringify(balance)};
  let saved = null;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function currentStatus() {
    const active = state.models.find((model) => model.isActive);
    let ready = false;
    let message = "尚未选择模型。";
    if (!state.settings.enabled) message = "行内补全已暂停。";
    else if (!active) message = "尚未选择模型。";
    else if (!active.model || !active.apiUrl) message = "当前模型配置不完整。";
    else if (active.protocol === "deepseek" && !active.hasApiKey) message = "未配置 API 密钥。";
    else {
      ready = true;
      message = active.hasApiKey
        ? "就绪 · " + active.name
        : "就绪 · " + active.name + "（本地服务，无需密钥）";
    }
    return { ready, enabled: state.settings.enabled, activeModelName: active?.name, message };
  }
  function sendState(selectedUid) {
    window.postMessage({
      type: "state",
      state: {
        models: clone(state.models),
        activeModelId: state.models.find((model) => model.isActive)?.uid,
        settings: clone(state.settings),
        presets: clone(state.presets),
        defaults: clone(state.defaults),
        status: currentStatus(),
        selectedUid: selectedUid || state.models.find((model) => model.isActive)?.uid,
      },
    }, "*");
    setTimeout(() => sendBalance(), 40);
  }
  function sendBalance(loading = false) {
    window.postMessage({
      type: "balance",
      supported: true,
      loading,
      data: loading ? undefined : clone(balance),
    }, "*");
  }
  function toast(level, message) {
    window.postMessage({ type: "toast", level, message }, "*");
  }
  function uniqueName(base) {
    if (!state.models.some((model) => model.name === base)) return base;
    let index = 2;
    while (state.models.some((model) => model.name === base + " " + index)) index += 1;
    return base + " " + index;
  }
  window.acquireVsCodeApi = function () {
    return {
      postMessage(message) {
        switch (message.type) {
          case "ready":
            setTimeout(() => sendState(), 20);
            break;
          case "setEnabled":
            state.settings.enabled = Boolean(message.enabled);
            toast("info", message.enabled ? "行内补全已启用。" : "行内补全已暂停。");
            setTimeout(() => sendState(), 20);
            break;
          case "addPreset": {
            const preset = state.presets.find((item) => item.key === message.preset);
            if (!preset) return;
            const existing = preset.key !== "custom" && state.models.find((model) =>
              model.model === preset.model && model.apiUrl === preset.apiUrl);
            if (existing) {
              state.models.forEach((model) => { model.isActive = model.uid === existing.uid; });
              toast("info", "该预设已存在，已切换到对应模型。");
              setTimeout(() => sendState(existing.uid), 20);
              return;
            }
            const model = {
              uid: "mock-" + Date.now(),
              name: uniqueName(preset.name),
              model: preset.model,
              apiUrl: preset.apiUrl,
              protocol: preset.protocol,
              hasApiKey: false,
              isActive: true,
            };
            state.models.forEach((item) => { item.isActive = false; });
            state.models.push(model);
            toast("success", "已添加预设模型。");
            setTimeout(() => sendState(model.uid), 20);
            break;
          }
          case "saveModel": {
            const draft = message.draft;
            const index = state.models.findIndex((model) => model.uid === draft.uid);
            if (index < 0) return;
            const model = state.models[index];
            model.name = draft.name;
            model.model = draft.model;
            model.apiUrl = draft.apiUrl;
            model.protocol = draft.protocol;
            if (draft.clearApiKey) model.hasApiKey = false;
            else if (draft.apiKey && draft.apiKey.trim()) model.hasApiKey = true;
            toast("success", "模型已保存。");
            setTimeout(() => sendState(model.uid), 20);
            break;
          }
          case "deleteModel": {
            const index = state.models.findIndex((model) => model.uid === message.uid);
            if (index < 0) return;
            const wasActive = state.models[index].isActive;
            state.models.splice(index, 1);
            if (wasActive && state.models[0]) state.models[0].isActive = true;
            toast("info", "模型已删除。");
            setTimeout(() => sendState(), 20);
            break;
          }
          case "setActive":
            state.models.forEach((model) => { model.isActive = model.uid === message.uid; });
            toast("success", "已切换当前模型。");
            setTimeout(() => sendState(message.uid), 20);
            break;
          case "updateSettings":
            Object.assign(state.settings, message.settings);
            toast("success", "FIM 设置已保存。");
            setTimeout(() => sendState(), 20);
            break;
          case "resetSettings":
            Object.assign(state.settings, state.defaults);
            toast("info", "已恢复默认 FIM 设置。");
            setTimeout(() => sendState(), 20);
            break;
          case "clearCache":
            toast("info", "补全缓存已清除。");
            break;
          case "refreshBalance":
            sendBalance(true);
            setTimeout(() => {
              balance.fetchedAt = Date.now();
              balance.balances[0].totalBalance = "43.16";
              sendBalance(false);
            }, 500);
            break;
          case "listModels":
            window.postMessage({
              type: "models",
              models: [
                {
                  id: "deepseek-flash",
                  name: "DeepSeek Flash",
                  contextWindow: 128000,
                  maxOutputTokens: 4096,
                },
                {
                  id: "deepseek-v4-pro",
                  name: "DeepSeek V4 Pro",
                  contextWindow: 128000,
                  maxOutputTokens: 4096,
                },
              ],
            }, "*");
            break;
          case "testModel": {
            setTimeout(() => {
              window.postMessage({
                type: "testResult",
                result: {
                  ok: true,
                  message: "连接成功，耗时 386 ms。",
                  sample: "a + b",
                  latencyMs: 386,
                },
              }, "*");
            }, 650);
            break;
          }
          default:
            break;
        }
      },
      getState() { return saved; },
      setState(value) { saved = value; },
    };
  };
`;

function buildHtml(source, nonce) {
  const shim = `<script nonce="${nonce}">${handlers}</script>`;
  return source
    .replace(/\{\{cspSource\}\}/g, "'self' 'unsafe-inline'")
    .replace(/\{\{nonce\}\}/g, nonce)
    .replace("{{styleUri}}", "/style.css")
    .replace("{{scriptUri}}", "/main.js")
    .replace("</head>", `<link rel="stylesheet" href="/preview.css" /></head>`)
    .replace(
      `<script nonce="${nonce}" src="/main.js"></script>`,
      `${shim}<script nonce="${nonce}" src="/main.js"></script>`,
    );
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/") {
      const nonce = "preview";
      const source = await readFile(join(mediaDir, "index.html"), "utf8");
      response.writeHead(200, { "Content-Type": mime[".html"] });
      response.end(buildHtml(source, nonce));
      return;
    }
    if (url.pathname === "/preview.css") {
      response.writeHead(200, { "Content-Type": mime[".css"] });
      response.end(previewCss);
      return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^[/\\]+/, "");
    const filePath = resolve(mediaDir, relative);
    if (!filePath.startsWith(resolve(mediaDir) + sep)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mime[extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  } catch (error) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Not found: ${error instanceof Error ? error.message : error}`);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FIM panel preview: http://127.0.0.1:${port}`);
});
