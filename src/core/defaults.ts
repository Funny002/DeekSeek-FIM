import type { FimSettings, ModelConfig, ModelPreset } from "./types";

export const DEFAULT_MODEL_UID = "deepseek-fim-default";

export const DEFAULT_SETTINGS: FimSettings = {
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

export const MODEL_PRESETS: ModelPreset[] = [
  {
    key: "deepseek",
    label: "DeepSeek FIM Flash（推荐）",
    description: "DeepSeek 官方 FIM Beta 接口，模型 deepseek-flash。",
    name: "DeepSeek FIM · Flash",
    model: "deepseek-flash",
    apiUrl: "https://api.deepseek.com/beta/completions",
    protocol: "deepseek",
  },
  {
    key: "deepseek-pro",
    label: "DeepSeek FIM V4 Pro",
    description: "DeepSeek FIM Beta 的高质量模型 deepseek-v4-pro。",
    name: "DeepSeek FIM · V4 Pro",
    model: "deepseek-v4-pro",
    apiUrl: "https://api.deepseek.com/beta/completions",
    protocol: "deepseek",
  },
  {
    key: "siliconflow",
    label: "Qwen Coder · 硅基流动",
    description: "OpenAI 兼容 /completions，需在服务端开通对应模型。",
    name: "Qwen2.5 Coder · 硅基流动",
    model: "Qwen/Qwen2.5-Coder-7B-Instruct",
    apiUrl: "https://api.siliconflow.cn/v1/completions",
    protocol: "openai",
  },
  {
    key: "ollama",
    label: "Qwen Coder · Ollama 本地",
    description: "本机 Ollama 的 OpenAI 兼容接口，API 密钥可留空。",
    name: "Qwen2.5 Coder · Ollama",
    model: "qwen2.5-coder:7b",
    apiUrl: "http://127.0.0.1:11434/v1/completions",
    protocol: "openai",
  },
  {
    key: "custom",
    label: "自定义模型",
    description: "手动填写任意 OpenAI 兼容 FIM /completions 接口。",
    name: "自定义模型",
    model: "",
    apiUrl: "",
    protocol: "openai",
  },
];

export function getPreset(key: ModelPreset["key"]): ModelPreset | undefined {
  return MODEL_PRESETS.find((preset) => preset.key === key);
}

export function createDefaultModels(): ModelConfig[] {
  const preset = getPreset("deepseek");
  if (!preset) {
    return [];
  }
  return [
    {
      uid: DEFAULT_MODEL_UID,
      name: preset.name,
      model: preset.model,
      apiUrl: preset.apiUrl,
      protocol: preset.protocol,
    },
  ];
}
