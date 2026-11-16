import * as vscode from "vscode";
import { DEFAULT_SETTINGS } from "./core/defaults";
import {
  normalizeSettings,
  readSettings,
  SETTINGS_SECTION,
  settingsToConfig,
} from "./core/settings";
import type { FimSettings } from "./core/types";

function configuration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(SETTINGS_SECTION);
}

export function getFimSettings(): FimSettings {
  const config = configuration();
  return readSettings((key, fallback) =>
    config.get<unknown>(key as string, fallback),
  );
}

export async function updateFimSettings(
  patch: Partial<FimSettings>,
): Promise<FimSettings> {
  const current = getFimSettings();
  const merged = normalizeSettings(patch, current);
  const config = configuration();
  const currentValues = settingsToConfig(current);
  const nextValues = settingsToConfig(merged);
  for (const [key, value] of Object.entries(nextValues)) {
    if (currentValues[key] !== value) {
      await config.update(key, value, vscode.ConfigurationTarget.Global);
    }
  }
  return merged;
}

export async function resetFimSettings(): Promise<FimSettings> {
  return updateFimSettings(DEFAULT_SETTINGS);
}
