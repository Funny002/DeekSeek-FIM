import { randomUUID } from "node:crypto";
import type * as vscode from "vscode";
import { createDefaultModels, getPreset } from "./core/defaults";
import { migrateLegacyModels } from "./core/migration";
import { validateModelDraft } from "./core/model";
import type {
  FimProtocol,
  ModelConfig,
  ModelDraft,
  ModelPreset,
} from "./core/types";

const MODELS_KEY = "deepseekFim.models.v1";
const ACTIVE_KEY = "deepseekFim.activeModelId.v1";
const SECRET_PREFIX = "deepseekFim.apiKey.v1.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeStoredModel(value: unknown): ModelConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const uid = typeof value.uid === "string" ? value.uid.trim() : "";
  if (!uid) {
    return undefined;
  }
  const protocol: FimProtocol =
    value.protocol === "deepseek"
      ? "deepseek"
      : value.protocol === "chat"
        ? "chat"
        : "openai";
  return {
    uid,
    name:
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : "未命名模型",
    model: typeof value.model === "string" ? value.model : "",
    apiUrl: typeof value.apiUrl === "string" ? value.apiUrl : "",
    protocol,
  };
}

function uniqueName(models: ModelConfig[], base: string): string {
  if (!models.some((model) => model.name === base)) {
    return base;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}`;
    if (!models.some((model) => model.name === candidate)) {
      return candidate;
    }
  }
  return `${base} ${randomUUID().slice(0, 4)}`;
}

export class ModelStore {
  private models: ModelConfig[] = [];
  private activeModelId: string | undefined;
  private initialized = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    const storedModels = this.context.globalState.get<unknown>(MODELS_KEY);
    if (storedModels === undefined) {
      this.models = createDefaultModels();
      this.activeModelId = this.models[0]?.uid;
    } else if (Array.isArray(storedModels)) {
      const seen = new Set<string>();
      this.models = [];
      for (const item of storedModels) {
        const model = sanitizeStoredModel(item);
        if (model && !seen.has(model.uid)) {
          seen.add(model.uid);
          this.models.push(model);
        }
      }
    } else {
      // Corrupt/unknown storage shape: recover with the default preset.
      this.models = createDefaultModels();
      this.activeModelId = this.models[0]?.uid;
    }

    // deepseek-chat is no longer a valid FIM model id; DeepSeek now exposes
    // deepseek-flash and deepseek-v4-pro on the beta endpoint.
    migrateLegacyModels(this.models);

    const storedActive = this.context.globalState.get<unknown>(ACTIVE_KEY);
    this.activeModelId =
      typeof storedActive === "string" &&
      this.models.some((model) => model.uid === storedActive)
        ? storedActive
        : this.models[0]?.uid;
    this.initialized = true;
    await this.persist();
  }

  getModels(): ModelConfig[] {
    return this.models.map((model) => ({ ...model }));
  }

  getActiveModelId(): string | undefined {
    return this.activeModelId;
  }

  getActiveModel(): ModelConfig | undefined {
    const model = this.models.find((item) => item.uid === this.activeModelId);
    return model ? { ...model } : undefined;
  }

  async setActiveModel(uid: string): Promise<void> {
    if (!this.models.some((model) => model.uid === uid)) {
      throw new Error("模型不存在，可能已被删除。");
    }
    this.activeModelId = uid;
    await this.persist();
  }

  async hasApiKey(uid: string): Promise<boolean> {
    return Boolean(await this.context.secrets.get(this.secretKey(uid)));
  }

  async getApiKey(uid: string): Promise<string | undefined> {
    return this.context.secrets.get(this.secretKey(uid));
  }

  async upsertModel(draft: ModelDraft): Promise<ModelConfig> {
    const validated = validateModelDraft(draft);
    const existingIndex = validated.uid
      ? this.models.findIndex((model) => model.uid === validated.uid)
      : -1;
    if (validated.uid && existingIndex < 0) {
      throw new Error("要保存的模型不存在，可能已被删除。");
    }

    const model: ModelConfig = {
      uid: existingIndex >= 0 ? this.models[existingIndex]!.uid : randomUUID(),
      name: validated.name,
      model: validated.model,
      apiUrl: validated.apiUrl,
      protocol: validated.protocol,
    };

    if (existingIndex >= 0) {
      this.models[existingIndex] = model;
    } else {
      this.models.push(model);
    }
    if (!this.activeModelId) {
      this.activeModelId = model.uid;
    }

    if (draft.clearApiKey) {
      await this.context.secrets.delete(this.secretKey(model.uid));
    } else if (typeof draft.apiKey === "string" && draft.apiKey.trim()) {
      await this.context.secrets.store(
        this.secretKey(model.uid),
        draft.apiKey.trim(),
      );
    }

    await this.persist();
    return { ...model };
  }

  async addPreset(
    key: ModelPreset["key"],
  ): Promise<{ model: ModelConfig; created: boolean }> {
    const preset = getPreset(key);
    if (!preset) {
      throw new Error("未知的模型预设。");
    }

    if (key !== "custom") {
      const existing = this.models.find(
        (model) =>
          model.model === preset.model &&
          model.apiUrl.replace(/\/+$/, "") ===
            preset.apiUrl.replace(/\/+$/, ""),
      );
      if (existing) {
        this.activeModelId = existing.uid;
        await this.persist();
        return { model: { ...existing }, created: false };
      }
    }

    const model: ModelConfig = {
      uid: randomUUID(),
      name: uniqueName(this.models, preset.name),
      model: preset.model,
      apiUrl: preset.apiUrl,
      protocol: preset.protocol,
    };
    this.models.push(model);
    this.activeModelId = model.uid;
    await this.persist();
    return { model: { ...model }, created: true };
  }

  async deleteModel(uid: string): Promise<void> {
    const index = this.models.findIndex((model) => model.uid === uid);
    if (index < 0) {
      return;
    }
    this.models.splice(index, 1);
    await this.context.secrets.delete(this.secretKey(uid));
    if (this.activeModelId === uid) {
      this.activeModelId = this.models[0]?.uid;
    }
    await this.persist();
  }

  private secretKey(uid: string): string {
    return `${SECRET_PREFIX}${uid}`;
  }

  private async persist(): Promise<void> {
    await this.context.globalState.update(MODELS_KEY, this.models);
    await this.context.globalState.update(ACTIVE_KEY, this.activeModelId);
  }
}
