import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./tauri";

export type WindowMode = "compact" | "full" | "spirit";

export type SetWindowModeOptions = {
  alwaysOnTop?: boolean;
};

export async function setWindowMode(
  mode: WindowMode,
  options: SetWindowModeOptions = {},
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke<void>("set_window_mode", {
    mode,
    alwaysOnTop: options.alwaysOnTop,
  });
}
