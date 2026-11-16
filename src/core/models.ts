export interface ApiModelInfo {
  id: string;
  name: string;
  ownedBy: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputModalities: string[];
  outputModalities: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStrings(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function parseModelsPayload(payload: unknown): ApiModelInfo[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("模型列表响应缺少 data。");
  }

  const models: ApiModelInfo[] = [];
  const seen = new Set<string>();
  for (const item of payload.data) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) {
      continue;
    }
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    models.push({
      id: item.id,
      name:
        typeof item.name === "string" && item.name.trim()
          ? item.name.trim()
          : item.id,
      ownedBy: typeof item.owned_by === "string" ? item.owned_by : "",
      contextWindow: readNumber(item, "context_window"),
      maxOutputTokens: readNumber(item, "max_output_tokens"),
      inputModalities: readStrings(item, "input_modalities"),
      outputModalities: readStrings(item, "output_modalities"),
    });
  }
  return models;
}

export function resolveModelsEndpoint(apiUrl: string): string {
  const url = new URL(apiUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("模型列表接口只支持 http:// 或 https://。");
  }

  const host = url.hostname.toLowerCase();
  let basePath = url.pathname.replace(/\/+$/, "");
  basePath = basePath.replace(/\/completions$/i, "");
  if (!basePath || basePath === "/") {
    basePath = "/v1";
  }
  url.pathname = host === "api.deepseek.com" ? "/models" : `${basePath}/models`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
