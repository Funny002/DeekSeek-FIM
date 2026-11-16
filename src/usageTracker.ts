import type * as vscode from "vscode";
import {
  applyUsageEvent,
  createUsageStats,
  sanitizeUsageStats,
  type UsageEvent,
  type UsageStats,
} from "./core/usage";

const USAGE_KEY = "deepseekFim.usage.v1";
const PERSIST_DELAY_MS = 400;

export class UsageTracker {
  private stats: UsageStats = createUsageStats();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async initialize(): Promise<void> {
    const stored = sanitizeUsageStats(
      this.context.globalState.get<unknown>(USAGE_KEY),
    );
    if (stored) {
      this.stats = stored;
    }
  }

  snapshot(): UsageStats {
    return { ...this.stats };
  }

  record(event: UsageEvent): void {
    this.stats = applyUsageEvent(this.stats, event);
    this.schedulePersist();
  }

  async reset(): Promise<UsageStats> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.stats = createUsageStats();
    await this.persist();
    return this.snapshot();
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await this.persist();
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    void this.persistSafely();
  }

  private schedulePersist(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.persistSafely();
    }, PERSIST_DELAY_MS);
  }

  private async persistSafely(): Promise<void> {
    try {
      await this.persist();
    } catch {
      // Usage statistics are best-effort; never disrupt completions.
    }
  }

  private async persist(): Promise<void> {
    await this.context.globalState.update(USAGE_KEY, this.stats);
  }
}
