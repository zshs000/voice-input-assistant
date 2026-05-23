import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type AsrSessionConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
  language: string;
};

export type AsrTranscriptionEvent =
  | { kind: "delta"; text: string }
  | { kind: "completed"; text: string }
  | { kind: "error"; message: string }
  | { kind: "session_finished" };

export type AsrListeners = {
  onDelta?: (text: string) => void;
  onCompleted?: (text: string) => void;
  onError?: (message: string) => void;
  onSessionFinished?: () => void;
};

export type AsrSessionHandle = {
  appendAudio: (bytes: Uint8Array) => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
  unlisten: () => void;
};

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function startAsrSession(
  config: AsrSessionConfig,
  listeners: AsrListeners = {},
): Promise<AsrSessionHandle> {
  const unlistenFn: UnlistenFn = await listen<AsrTranscriptionEvent>(
    "asr-transcription",
    (event) => {
      const payload = event.payload;
      switch (payload.kind) {
        case "delta":
          listeners.onDelta?.(payload.text);
          break;
        case "completed":
          listeners.onCompleted?.(payload.text);
          break;
        case "error":
          listeners.onError?.(payload.message);
          break;
        case "session_finished":
          listeners.onSessionFinished?.();
          break;
      }
    },
  );

  try {
    await invoke<void>("asr_start", {
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      model: config.model,
      language: config.language,
    });
  } catch (error) {
    unlistenFn();
    throw error;
  }

  return {
    async appendAudio(bytes: Uint8Array) {
      await invoke<void>("asr_append_audio", { audioB64: bytesToBase64(bytes) });
    },
    async stop() {
      await invoke<void>("asr_stop");
    },
    async cancel() {
      await invoke<void>("asr_cancel");
    },
    unlisten() {
      unlistenFn();
    },
  };
}
