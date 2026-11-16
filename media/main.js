(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);

  const el = {
    enabledToggle: $("enabledToggle"),
    statusLine: $("statusLine"),
    statusText: $("statusText"),
    modelCount: $("modelCount"),
    modelList: $("modelList"),
    emptyModels: $("emptyModels"),
    balanceBox: $("balanceBox"),
    balanceMain: $("balanceMain"),
    balanceMeta: $("balanceMeta"),
    refreshBalanceBtn: $("refreshBalanceBtn"),
    presetSelect: $("presetSelect"),
    addPresetBtn: $("addPresetBtn"),
    modelForm: $("modelForm"),
    editorTitle: $("editorTitle"),
    activeBadge: $("activeBadge"),
    fieldName: $("fieldName"),
    fieldModel: $("fieldModel"),
    fieldUrl: $("fieldUrl"),
    fieldProtocol: $("fieldProtocol"),
    fieldKey: $("fieldKey"),
    toggleKey: $("toggleKey"),
    keyHint: $("keyHint"),
    clearKey: $("clearKey"),
    fetchModelsBtn: $("fetchModelsBtn"),
    modelOptions: $("modelOptions"),
    modelCatalogHint: $("modelCatalogHint"),
    saveModelBtn: $("saveModelBtn"),
    testBtn: $("testBtn"),
    setActiveBtn: $("setActiveBtn"),
    deleteBtn: $("deleteBtn"),
    testOutput: $("testOutput"),
    setMaxTokens: $("setMaxTokens"),
    setContextLines: $("setContextLines"),
    setMaxPrefixChars: $("setMaxPrefixChars"),
    setMaxSuffixChars: $("setMaxSuffixChars"),
    setDebounceMs: $("setDebounceMs"),
    setTemperature: $("setTemperature"),
    setTopP: $("setTopP"),
    setStopSequences: $("setStopSequences"),
    setTimeoutMs: $("setTimeoutMs"),
    setRetryCount: $("setRetryCount"),
    setRetryDelayMs: $("setRetryDelayMs"),
    setAutoTrigger: $("setAutoTrigger"),
    setMultiLine: $("setMultiLine"),
    setLanguages: $("setLanguages"),
    saveSettingsBtn: $("saveSettingsBtn"),
    resetSettingsBtn: $("resetSettingsBtn"),
    clearCacheBtn: $("clearCacheBtn"),
    toast: $("toast"),
  };

  const ui = {
    data: null,
    selectedUid: null,
    modelDirty: false,
    settingsDirty: false,
    pendingModelSave: false,
    testing: false,
    deleteArmed: false,
    deleteTimer: null,
    catalogUrl: null,
    panels: {
      models: true,
      settings: true,
      tips: false,
    },
  };

  const DEFAULT_PANELS = {
    models: true,
    settings: true,
    tips: false,
  };

  let toastTimer = null;

  const SETTINGS_INPUTS = [
    el.setMaxTokens,
    el.setContextLines,
    el.setMaxPrefixChars,
    el.setMaxSuffixChars,
    el.setDebounceMs,
    el.setTemperature,
    el.setTopP,
    el.setStopSequences,
    el.setTimeoutMs,
    el.setRetryCount,
    el.setRetryDelayMs,
    el.setAutoTrigger,
    el.setMultiLine,
    el.setLanguages,
  ];

  function init() {
    const saved = vscode.getState();
    if (saved && typeof saved.selectedUid === "string") {
      ui.selectedUid = saved.selectedUid;
    }
    if (saved && saved.panels && typeof saved.panels === "object") {
      for (const [panel, expanded] of Object.entries(saved.panels)) {
        if (panel in DEFAULT_PANELS && typeof expanded === "boolean") {
          ui.panels[panel] = expanded;
        }
      }
    }
    bindEvents();
    bindPanelToggles();
    applyPanelState();
    vscode.postMessage({ type: "ready" });
  }

  function bindEvents() {
    el.enabledToggle.addEventListener("change", () => {
      vscode.postMessage({
        type: "setEnabled",
        enabled: el.enabledToggle.checked,
      });
    });

    el.addPresetBtn.addEventListener("click", () => {
      const preset = el.presetSelect.value;
      if (preset) {
        ui.modelDirty = false;
        vscode.postMessage({ type: "addPreset", preset });
      }
    });

    el.refreshBalanceBtn.addEventListener("click", () => {
      el.refreshBalanceBtn.disabled = true;
      el.refreshBalanceBtn.textContent = "刷新中…";
      vscode.postMessage({ type: "refreshBalance", force: true });
    });

    el.modelForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveModel();
    });

    for (const input of [
      el.fieldName,
      el.fieldModel,
      el.fieldUrl,
      el.fieldProtocol,
      el.fieldKey,
      el.clearKey,
    ]) {
      input.addEventListener("input", markModelDirty);
      input.addEventListener("change", markModelDirty);
    }

    el.fieldKey.addEventListener("input", () => {
      if (el.fieldKey.value.trim()) {
        el.clearKey.checked = false;
      }
    });

    el.clearKey.addEventListener("change", () => {
      if (el.clearKey.checked) {
        el.fieldKey.value = "";
      }
    });

    el.toggleKey.addEventListener("click", () => {
      const visible = el.fieldKey.type === "text";
      el.fieldKey.type = visible ? "password" : "text";
      el.toggleKey.textContent = visible ? "显示" : "隐藏";
    });

    el.fetchModelsBtn.addEventListener("click", fetchModels);
    el.fieldUrl.addEventListener("input", () => {
      ui.catalogUrl = null;
      clearModelCatalog();
    });

    el.testBtn.addEventListener("click", testConnection);
    el.setActiveBtn.addEventListener("click", setActiveModel);
    el.deleteBtn.addEventListener("click", deleteModel);

    for (const input of SETTINGS_INPUTS) {
      input.addEventListener("input", () => {
        ui.settingsDirty = true;
      });
      input.addEventListener("change", () => {
        ui.settingsDirty = true;
      });
    }

    el.saveSettingsBtn.addEventListener("click", saveSettings);
    el.resetSettingsBtn.addEventListener("click", () => {
      ui.settingsDirty = false;
      vscode.postMessage({ type: "resetSettings" });
    });
    el.clearCacheBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "clearCache" });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || typeof message.type !== "string") {
        return;
      }
      if (message.type === "state") {
        applyState(message.state);
      } else if (message.type === "toast") {
        showToast(message.level, message.message);
        if (message.level === "error" && ui.pendingModelSave) {
          ui.pendingModelSave = false;
        }
      } else if (message.type === "testResult") {
        renderTestResult(message.result);
      } else if (message.type === "balance") {
        renderBalance(message);
      } else if (message.type === "models") {
        renderModelCatalog(message);
      }
    });
  }

  function bindPanelToggles() {
    for (const button of document.querySelectorAll("[data-panel]")) {
      button.addEventListener("click", () => {
        const panel = button.getAttribute("data-panel");
        if (!panel) {
          return;
        }
        setPanel(panel, button.getAttribute("aria-expanded") !== "true");
      });
    }
  }

  function applyPanelState() {
    for (const button of document.querySelectorAll("[data-panel]")) {
      const panel = button.getAttribute("data-panel");
      if (panel && panel in DEFAULT_PANELS) {
        setPanel(panel, ui.panels[panel], false);
      }
    }
  }

  function setPanel(panel, expanded, persist = true) {
    const button = document.querySelector(`[data-panel="${panel}"]`);
    if (!button) {
      return;
    }
    const section = button.closest(".panel");
    const bodyId = button.getAttribute("aria-controls");
    const body = bodyId ? document.getElementById(bodyId) : null;
    button.setAttribute("aria-expanded", String(expanded));
    if (section) {
      section.classList.toggle("collapsed", !expanded);
    }
    if (body) {
      body.setAttribute("aria-hidden", String(!expanded));
    }
    ui.panels[panel] = expanded;
    if (persist) {
      persistWebviewState();
    }
  }

  function persistWebviewState() {
    vscode.setState({
      selectedUid: ui.selectedUid,
      panels: { ...ui.panels },
    });
  }

  function markModelDirty() {
    ui.modelDirty = true;
  }

  function applyState(state) {
    if (!state || !Array.isArray(state.models)) {
      return;
    }
    const previousSelected = ui.selectedUid;
    const previousDirty = ui.modelDirty;
    ui.data = state;

    if (ui.pendingModelSave) {
      ui.modelDirty = false;
      ui.pendingModelSave = false;
    }

    const exists = (uid) =>
      typeof uid === "string" && state.models.some((model) => model.uid === uid);

    let selected = state.selectedUid || previousSelected;
    if (!exists(selected)) {
      selected = state.activeModelId || (state.models[0] && state.models[0].uid);
    }
    if (previousDirty && exists(previousSelected)) {
      selected = previousSelected;
    }
    ui.selectedUid = selected || null;
    if (ui.selectedUid) {
      persistWebviewState();
    }

    el.enabledToggle.checked = Boolean(state.settings && state.settings.enabled);
    renderStatus(state);
    renderModelList(state);
    renderPresets(state);
    renderModelForm(!ui.modelDirty);
    renderSettings(!ui.settingsDirty);
  }

  function renderStatus(state) {
    const status = state.status || {};
    let tone = "warn";
    if (!state.settings || !state.settings.enabled) {
      tone = "off";
    } else if (status.ready) {
      tone = "ready";
    }
    el.statusLine.dataset.tone = tone;
    el.statusText.textContent = status.message || "等待配置";
    el.statusText.title = status.activeModelName
      ? `当前模型：${status.activeModelName}`
      : "";
  }

  function renderPresets(state) {
    if (!Array.isArray(state.presets) || el.presetSelect.options.length > 0) {
      return;
    }
    for (const preset of state.presets) {
      const option = document.createElement("option");
      option.value = preset.key;
      option.textContent = preset.label;
      option.title = preset.description || "";
      el.presetSelect.appendChild(option);
    }
  }

  function renderBalance(message) {
    if (!message || message.supported !== true) {
      el.balanceBox.classList.add("hidden");
      el.refreshBalanceBtn.disabled = false;
      el.refreshBalanceBtn.textContent = "刷新";
      return;
    }

    el.balanceBox.classList.remove("hidden");
    el.refreshBalanceBtn.disabled = Boolean(message.loading);
    el.refreshBalanceBtn.textContent = message.loading ? "刷新中…" : "刷新";

    if (message.loading) {
      el.balanceMain.className = "balance-main";
      el.balanceMain.textContent = "查询中…";
      el.balanceMeta.textContent = "正在读取 DeepSeek 账户余额";
      return;
    }

    if (message.error) {
      el.balanceMain.className = "balance-main error";
      el.balanceMain.textContent = message.error;
      el.balanceMeta.textContent = "点击刷新重试，或在模型设置中检查 API 密钥。";
      return;
    }

    const data = message.data;
    if (!data || !Array.isArray(data.balances)) {
      el.balanceMain.className = "balance-main error";
      el.balanceMain.textContent = "余额数据格式异常";
      el.balanceMeta.textContent = "";
      return;
    }

    if (!data.isAvailable) {
      el.balanceMain.className = "balance-main warn";
      el.balanceMain.textContent = "余额不足，账户当前不可用";
    } else {
      el.balanceMain.className = "balance-main";
      const amounts = data.balances.map((item) => {
        const symbol = currencySymbol(item.currency);
        return item.totalBalance
          ? `${symbol}${item.totalBalance}`
          : `${item.currency || "余额"} —`;
      });
      el.balanceMain.textContent = amounts.join(" / ") || "—";
    }

    const details = data.balances.map((item) => {
      const symbol = currencySymbol(item.currency);
      return `${symbol}赠金 ${item.grantedBalance || "0"} · 充值 ${item.toppedUpBalance || "0"}`;
    });
    const updated = data.fetchedAt
      ? `更新于 ${new Date(data.fetchedAt).toLocaleTimeString()}`
      : "";
    el.balanceMeta.textContent = [details.join("；"), updated]
      .filter(Boolean)
      .join(" · ");
  }

  function currencySymbol(currency) {
    if (currency === "CNY") {
      return "¥";
    }
    if (currency === "USD") {
      return "$";
    }
    return currency ? `${currency} ` : "";
  }

  function escapeStopSequence(sequence) {
    return String(sequence)
      .replace(/\\/g, "\\\\")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t");
  }

  function renderModelList(state) {
    el.modelList.replaceChildren();
    el.modelCount.textContent = String(state.models.length);
    el.emptyModels.classList.toggle("hidden", state.models.length > 0);

    for (const model of state.models) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "model-card";
      card.classList.toggle("selected", model.uid === ui.selectedUid);
      card.classList.toggle("is-active", Boolean(model.isActive));
      card.setAttribute(
        "aria-pressed",
        model.uid === ui.selectedUid ? "true" : "false",
      );
      card.title = `${model.name}\n${model.model || "未填写模型 ID"}\n${model.apiUrl || "未填写地址"}`;

      const dot = document.createElement("span");
      dot.className = "model-dot";
      dot.setAttribute("aria-hidden", "true");

      const main = document.createElement("span");
      main.className = "model-main";
      const name = document.createElement("span");
      name.className = "model-name";
      name.textContent = model.name;

      const meta = document.createElement("span");
      meta.className = "model-meta";
      meta.textContent = model.model ? model.model : "未填写模型 ID";
      main.appendChild(name);
      main.appendChild(meta);

      const key = document.createElement("span");
      key.className = model.hasApiKey ? "model-key ok" : "model-key";
      key.textContent = model.hasApiKey ? "已存密钥" : "无密钥";
      key.title = model.hasApiKey
        ? "API 密钥已保存在 SecretStorage"
        : "未保存 API 密钥";

      card.appendChild(dot);
      card.appendChild(main);
      card.appendChild(key);
      card.addEventListener("click", () => selectModel(model.uid));
      el.modelList.appendChild(card);
    }
  }

  function selectModel(uid) {
    if (uid === ui.selectedUid) {
      return;
    }
    ui.selectedUid = uid;
    ui.modelDirty = false;
    resetDeleteButton();
    persistWebviewState();
    if (ui.data) {
      renderModelList(ui.data);
      renderModelForm(true);
    }
  }

  function selectedModel() {
    if (!ui.data || !Array.isArray(ui.data.models)) {
      return null;
    }
    return ui.data.models.find((model) => model.uid === ui.selectedUid) || null;
  }

  function renderModelForm(force) {
    const model = selectedModel();
    el.modelForm.classList.toggle("hidden", !model);
    if (!model) {
      return;
    }

    el.editorTitle.textContent = "编辑模型";
    el.activeBadge.classList.toggle("hidden", !model.isActive);
    el.setActiveBtn.disabled = Boolean(model.isActive);
    el.setActiveBtn.textContent = model.isActive ? "当前模型" : "设为当前模型";

    if (force || !ui.modelDirty) {
      fillModelForm(model);
    }
  }

  function fillModelForm(model) {
    el.fieldName.value = model.name || "";
    el.fieldModel.value = model.model || "";
    el.fieldUrl.value = model.apiUrl || "";
    el.fieldProtocol.value = model.protocol || "openai";
    el.fieldKey.value = "";
    el.fieldKey.type = "password";
    el.toggleKey.textContent = "显示";
    el.clearKey.checked = false;
    el.fieldKey.placeholder = model.hasApiKey
      ? "已保存，留空保持不变"
      : model.protocol === "deepseek"
        ? "必填"
        : "可选（本地服务留空）";
    el.keyHint.textContent = model.hasApiKey
      ? "密钥已保存；留空保持不变。"
      : "尚未保存密钥。DeepSeek 必填，本地服务可留空。";
    el.keyHint.classList.toggle("ok", Boolean(model.hasApiKey));
    resetDeleteButton();
    clearTestOutput();
    if (ui.catalogUrl !== model.apiUrl) {
      ui.catalogUrl = model.apiUrl;
      clearModelCatalog();
    }
  }

  function readModelForm() {
    return {
      uid: ui.selectedUid || undefined,
      name: el.fieldName.value.trim(),
      model: el.fieldModel.value.trim(),
      apiUrl: el.fieldUrl.value.trim(),
      protocol:
        el.fieldProtocol.value === "deepseek" ||
        el.fieldProtocol.value === "chat"
          ? el.fieldProtocol.value
          : "openai",
      apiKey: el.fieldKey.value,
      clearApiKey: el.clearKey.checked,
    };
  }

  function saveModel() {
    const draft = readModelForm();
    if (!draft.name) {
      showToast("error", "请填写模型名称。");
      el.fieldName.focus();
      return;
    }
    if (!draft.model) {
      showToast("error", "请填写模型 ID。");
      el.fieldModel.focus();
      return;
    }
    if (!draft.apiUrl) {
      showToast("error", "请填写 API 地址。");
      el.fieldUrl.focus();
      return;
    }
    try {
      const parsed = new URL(draft.apiUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("只支持 http/https");
      }
    } catch {
      showToast("error", "API 地址不是合法的 http(s) URL。");
      el.fieldUrl.focus();
      return;
    }

    ui.pendingModelSave = true;
    vscode.postMessage({ type: "saveModel", draft });
  }

  function fetchModels() {
    const draft = readModelForm();
    if (!draft.apiUrl) {
      showToast("error", "请先填写 API 地址。");
      el.fieldUrl.focus();
      return;
    }
    el.fetchModelsBtn.disabled = true;
    el.fetchModelsBtn.textContent = "获取中…";
    ui.catalogUrl = draft.apiUrl;
    vscode.postMessage({ type: "listModels", draft });
  }

  function renderModelCatalog(message) {
    el.fetchModelsBtn.disabled = false;
    el.fetchModelsBtn.textContent = "获取";
    if (message.error) {
      el.modelOptions.replaceChildren();
      el.modelCatalogHint.textContent = message.error;
      showToast("error", `获取模型列表失败：${message.error}`);
      return;
    }

    const models = Array.isArray(message.models) ? message.models : [];
    el.modelOptions.replaceChildren();
    for (const model of models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.label = model.name && model.name !== model.id ? model.name : model.id;
      const meta = [];
      if (model.contextWindow) {
        meta.push(`上下文 ${model.contextWindow}`);
      }
      if (model.maxOutputTokens) {
        meta.push(`输出上限 ${model.maxOutputTokens}`);
      }
      option.title = meta.join(" · ");
      el.modelOptions.appendChild(option);
    }

    if (models.length === 0) {
      el.modelCatalogHint.textContent = "服务端未返回可用模型。";
      return;
    }
    el.modelCatalogHint.textContent = `可用 ${models.length} 个：${models
      .map((model) => model.id)
      .join("、")}`;
    showToast("success", `已获取 ${models.length} 个模型。`);
  }

  function clearModelCatalog() {
    el.modelOptions.replaceChildren();
    el.modelCatalogHint.textContent =
      "可从服务端 /models 获取可用模型，并选择模型 ID。";
    el.fetchModelsBtn.disabled = false;
    el.fetchModelsBtn.textContent = "获取";
  }

  function setActiveModel() {
    if (!ui.selectedUid) {
      return;
    }
    vscode.postMessage({ type: "setActive", uid: ui.selectedUid });
  }

  function deleteModel() {
    if (!ui.selectedUid) {
      return;
    }
    if (!ui.deleteArmed) {
      ui.deleteArmed = true;
      el.deleteBtn.textContent = "再点一次删除";
      el.deleteBtn.classList.add("armed");
      clearTimeout(ui.deleteTimer);
      ui.deleteTimer = setTimeout(resetDeleteButton, 3000);
      return;
    }
    const uid = ui.selectedUid;
    ui.deleteArmed = false;
    ui.modelDirty = false;
    resetDeleteButton();
    vscode.postMessage({ type: "deleteModel", uid });
  }

  function resetDeleteButton() {
    ui.deleteArmed = false;
    clearTimeout(ui.deleteTimer);
    el.deleteBtn.textContent = "删除模型";
    el.deleteBtn.classList.remove("armed");
  }

  function testConnection() {
    if (ui.testing) {
      return;
    }
    const draft = readModelForm();
    if (!draft.model || !draft.apiUrl) {
      showToast("error", "测试前请填写模型 ID 和 API 地址。");
      return;
    }
    ui.testing = true;
    el.testBtn.disabled = true;
    el.testBtn.textContent = "测试中…";
    renderTestPending();
    vscode.postMessage({ type: "testModel", draft });
  }

  function renderTestPending() {
    el.testOutput.classList.remove("hidden");
    el.testOutput.dataset.tone = "info";
    el.testOutput.replaceChildren();
    const title = document.createElement("div");
    title.className = "output-title";
    title.textContent = "正在请求模型…";
    el.testOutput.appendChild(title);
  }

  function clearTestOutput() {
    el.testOutput.classList.add("hidden");
    el.testOutput.replaceChildren();
    delete el.testOutput.dataset.tone;
  }

  function renderTestResult(result) {
    ui.testing = false;
    el.testBtn.disabled = false;
    el.testBtn.textContent = "测试连接";
    el.testOutput.classList.remove("hidden");
    el.testOutput.dataset.tone = result && result.ok ? "success" : "error";
    el.testOutput.replaceChildren();

    const title = document.createElement("div");
    title.className = "output-title";
    title.textContent =
      result && result.ok ? "连接成功" : "连接失败";
    el.testOutput.appendChild(title);

    if (result && result.message) {
      const message = document.createElement("div");
      message.textContent = result.message;
      el.testOutput.appendChild(message);
    }

    if (result && result.sample) {
      const sample = document.createElement("pre");
      sample.className = "output-sample";
      sample.textContent = result.sample;
      el.testOutput.appendChild(sample);
    }
  }

  function renderSettings(force) {
    if (!force || !ui.data || !ui.data.settings) {
      return;
    }
    const settings = ui.data.settings;
    el.setMaxTokens.value = String(settings.maxTokens);
    el.setContextLines.value = String(settings.contextLines);
    el.setMaxPrefixChars.value = String(settings.maxPrefixChars);
    el.setMaxSuffixChars.value = String(settings.maxSuffixChars);
    el.setDebounceMs.value = String(settings.debounceMs);
    el.setTemperature.value = String(settings.temperature);
    el.setTopP.value = String(settings.topP);
    el.setStopSequences.value = Array.isArray(settings.stopSequences)
      ? settings.stopSequences.map(escapeStopSequence).join("\n")
      : "";
    el.setTimeoutMs.value = String(settings.requestTimeoutMs);
    el.setRetryCount.value = String(settings.retryCount);
    el.setRetryDelayMs.value = String(settings.retryDelayMs);
    el.setAutoTrigger.checked = Boolean(settings.autoTrigger);
    el.setMultiLine.checked = Boolean(settings.multiLine);
    el.setLanguages.value = Array.isArray(settings.languages)
      ? settings.languages.join(", ")
      : "";
    ui.settingsDirty = false;
  }

  function numberValue(input, label, min, max, integer) {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${label}需在 ${min}–${max} 之间。`);
    }
    return integer ? Math.round(value) : Math.round(value * 10000) / 10000;
  }

  function saveSettings() {
    try {
      const settings = {
        maxTokens: numberValue(el.setMaxTokens, "最大输出 Token", 1, 4096, true),
        contextLines: numberValue(el.setContextLines, "上下文行数", 0, 200, true),
        maxPrefixChars: numberValue(
          el.setMaxPrefixChars,
          "前缀字符上限",
          200,
          20000,
          true,
        ),
        maxSuffixChars: numberValue(
          el.setMaxSuffixChars,
          "后缀字符上限",
          0,
          20000,
          true,
        ),
        debounceMs: numberValue(el.setDebounceMs, "触发延迟", 0, 2000, true),
        temperature: numberValue(el.setTemperature, "随机性", 0, 2, false),
        topP: numberValue(el.setTopP, "核采样阈值", 0.001, 1, false),
        stopSequences: el.setStopSequences.value
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 16),
        retryCount: numberValue(el.setRetryCount, "失败重试次数", 0, 2, true),
        retryDelayMs: numberValue(
          el.setRetryDelayMs,
          "重试间隔",
          0,
          2000,
          true,
        ),
        requestTimeoutMs: numberValue(
          el.setTimeoutMs,
          "请求超时",
          1000,
          60000,
          true,
        ),
        autoTrigger: el.setAutoTrigger.checked,
        multiLine: el.setMultiLine.checked,
        languages: el.setLanguages.value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
      ui.settingsDirty = false;
      vscode.postMessage({ type: "updateSettings", settings });
    } catch (error) {
      showToast("error", error.message || String(error));
    }
  }

  function showToast(level, message) {
    if (!message) {
      return;
    }
    clearTimeout(toastTimer);
    el.toast.className = "toast show " + (level || "info");
    el.toast.textContent = message;
    toastTimer = setTimeout(() => {
      el.toast.className = "toast";
    }, level === "error" ? 5200 : 3600);
  }

  init();
})();
