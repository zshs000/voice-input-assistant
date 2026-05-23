import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./tauri";

export type WindowMode = "compact" | "full";

export async function setWindowMode(mode: WindowMode): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke<void>("set_window_mode", { mode });
}
