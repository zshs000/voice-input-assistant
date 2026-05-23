import { invoke } from "@tauri-apps/api/core";
import type { HistoryItem } from "../domain/history";
import type { AppSettings } from "../domain/settings";
import { DEFAULT_SETTINGS, normalizeSettings } from "../domain/settings";

const SETTINGS_KEY = "voice-input-assistant:settings";
const HISTORY_KEY = "voice-input-assistant:history";

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

async function invokeIfAvailable<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke<T>(command, args);
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
  const settings = await invokeIfAvailable<unknown>("load_settings");

  if (settings) {
    return normalizeSettings(settings);
  }

  return normalizeSettings(readJson(SETTINGS_KEY, DEFAULT_SETTINGS));
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const normalized = normalizeSettings(settings);
  const result = await invokeIfAvailable<void>("save_settings", { settings: normalized });

  if (result === null) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  }
}

export async function loadHistory(): Promise<HistoryItem[]> {
  const history = await invokeIfAvailable<HistoryItem[]>("load_history");

  if (history) {
    return history;
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
  const result = await invokeIfAvailable<void>("save_history", { history: textOnlyHistory });

  if (result === null) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(textOnlyHistory));
  }
}

export async function copyText(text: string): Promise<void> {
  const result = await invokeIfAvailable<void>("copy_text", { text });

  if (result === null) {
    await navigator.clipboard.writeText(text);
  }
}

export async function insertText(text: string): Promise<void> {
  const result = await invokeIfAvailable<void>("insert_text", { text });

  if (result === null) {
    await navigator.clipboard.writeText(text);
  }
}
