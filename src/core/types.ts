export type FimProtocol = "deepseek" | "openai" | "chat";

export interface ModelConfig {
  /** Internal stable id used for the secret-storage key. */
  uid: string;
  /** Human-readable name shown in the panel. */
  name: string;
  /** Model ID sent to the API (the "模型 ID" field). */
  model: string;
  /** Base URL or full completion endpoint. */
  apiUrl: string;
  protocol: FimProtocol;
}

export interface ModelDraft {
  uid?: string;
  name: string;
  model: string;
  apiUrl: string;
  protocol: FimProtocol;
  /** A non-empty value replaces the stored secret. */
  apiKey?: string;
  /** Remove the stored secret when saving. */
  clearApiKey?: boolean;
}

export interface FimSettings {
  enabled: boolean;
  autoTrigger: boolean;
  multiLine: boolean;
  debounceMs: number;
  maxTokens: number;
  contextLines: number;
  maxPrefixChars: number;
  maxSuffixChars: number;
  temperature: number;
  topP: number;
  stopSequences: string[];
  retryCount: number;
  retryDelayMs: number;
  requestTimeoutMs: number;
  languages: string[];
}

export interface CompletionUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface CompletionResult {
  text: string;
  latencyMs: number;
  usage: CompletionUsage;
  prefixChars: number;
  suffixChars: number;
  finishReason?: string;
}

export interface FimContext {
  prefix: string;
  suffix: string;
}

export interface ModelPreset {
  key: "deepseek" | "deepseek-pro" | "siliconflow" | "ollama" | "custom";
  label: string;
  description: string;
  name: string;
  model: string;
  apiUrl: string;
  protocol: FimProtocol;
}

export interface PublicModel extends ModelConfig {
  hasApiKey: boolean;
  isActive: boolean;
}

export interface PanelStatus {
  ready: boolean;
  enabled: boolean;
  activeModelName?: string;
  message: string;
}

export interface BalanceView {
  supported: boolean;
  data?: {
    isAvailable: boolean;
    balances: {
      currency: string;
      totalBalance: string;
      grantedBalance: string;
      toppedUpBalance: string;
    }[];
    fetchedAt: number;
  };
  error?: string;
  loading?: boolean;
}

export interface PanelState {
  models: PublicModel[];
  activeModelId?: string;
  settings: FimSettings;
  presets: ModelPreset[];
  defaults: FimSettings;
  status: PanelStatus;
  selectedUid?: string;
}
