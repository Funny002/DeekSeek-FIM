import { DEFAULT_MODEL_UID } from "./defaults";
import type { ModelConfig } from "./types";

/**
 * DeepSeek removed `deepseek-chat` from the FIM completion API. Keep existing
 * user models working by migrating only the model id, preserving uid/name/key.
 */
export function migrateLegacyModels(models: ModelConfig[]): number {
  let migrated = 0;
  for (const model of models) {
    if (model.protocol !== "deepseek" || model.model !== "deepseek-chat") {
      continue;
    }
    model.model = "deepseek-flash";
    if (model.uid === DEFAULT_MODEL_UID && model.name === "DeepSeek FIM") {
      model.name = "DeepSeek FIM · Flash";
    }
    migrated += 1;
  }
  return migrated;
}
