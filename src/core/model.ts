import {
  resolveChatEndpoint,
  resolveCompletionsEndpoint,
  validateApiUrl,
} from "./endpoint";
import type { FimProtocol, ModelDraft } from "./types";

export interface ValidatedModel {
  uid?: string;
  name: string;
  model: string;
  apiUrl: string;
  protocol: FimProtocol;
}

function isProtocol(value: unknown): value is FimProtocol {
  return value === "deepseek" || value === "openai" || value === "chat";
}

export function validateModelDraft(draft: ModelDraft): ValidatedModel {
  const name = String(draft.name ?? "").trim();
  if (!name) {
    throw new Error("请填写模型名称。");
  }
  if (name.length > 80) {
    throw new Error("模型名称不能超过 80 个字符。");
  }

  const model = String(draft.model ?? "").trim();
  if (!model) {
    throw new Error("请填写模型 ID（例如 deepseek-flash）。");
  }
  if (model.length > 200) {
    throw new Error("模型 ID 不能超过 200 个字符。");
  }

  const protocol = isProtocol(draft.protocol) ? draft.protocol : "openai";
  const apiUrl = String(draft.apiUrl ?? "").trim();
  const url = validateApiUrl(apiUrl);
  if (url.username || url.password) {
    throw new Error("请不要把账号密码写在 API 地址里，改用 API 密钥。");
  }
  if (protocol === "chat") {
    resolveChatEndpoint(apiUrl);
  } else {
    resolveCompletionsEndpoint(apiUrl, protocol);
  }

  return {
    uid: draft.uid,
    name,
    model,
    apiUrl,
    protocol,
  };
}
