import { invoke } from "@tauri-apps/api/core";
import type { HistoryItem } from "../domain/history";
import type { AppSettings } from "../domain/settings";
import { DEFAULT_SETTINGS, normalizeSettings } from "../domain/settings";

const SETTINGS_KEY = "voice-input-assistant:settings";
const HISTORY_KEY = "voice-input-assistant:history";

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function loadSettings(): Promise<AppSettings> {
  if (isTauriRuntime()) {
    const settings = await invoke<unknown>("load_settings");
    return normalizeSettings(settings);
  }
  return normalizeSettings(readJson(SETTINGS_KEY, DEFAULT_SETTINGS));
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const normalized = normalizeSettings(settings);
  if (isTauriRuntime()) {
    await invoke<void>("save_settings", { settings: normalized });
    return;
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
}

export async function loadHistory(): Promise<HistoryItem[]> {
  if (isTauriRuntime()) {
    return invoke<HistoryItem[]>("load_history");
  }
  return readJson<HistoryItem[]>(HISTORY_KEY, []);
}

export async function saveHistory(history: HistoryItem[]): Promise<void> {
  const textOnlyHistory = history.map((item) => ({
    id: item.id,
    recognizedText: item.recognizedText,
    finalText: item.finalText,
    templateId: item.templateId,
    status: item.status,
    createdAt: item.createdAt,
  }));
  if (isTauriRuntime()) {
    await invoke<void>("save_history", { history: textOnlyHistory });
    return;
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(textOnlyHistory));
}

export async function copyText(text: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke<void>("copy_text", { text });
    return;
  }
  await navigator.clipboard.writeText(text);
}

export async function insertText(text: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke<void>("insert_text", { text });
    return;
  }
  await navigator.clipboard.writeText(text);
}
