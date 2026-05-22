import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../domain/settings";
import {
  copyText,
  insertText,
  loadHistory,
  loadSettings,
  recognizeSpeech,
  saveHistory,
  saveSettings,
  startRecording,
  stopRecording,
} from "./tauri";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe("tauri service browser fallback", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  it("persists settings through localStorage when Tauri is unavailable", async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      outputMode: "insert",
      llm: { ...DEFAULT_SETTINGS.llm, baseUrl: "https://api.example.com/v1" },
    });

    const settings = await loadSettings();

    expect(settings.outputMode).toBe("insert");
    expect(settings.llm.baseUrl).toBe("https://api.example.com/v1");
  });

  it("persists text-only history through localStorage", async () => {
    await saveHistory([
      {
        id: "hist_1",
        recognizedText: "原始",
        finalText: "最终",
        templateId: "clean",
        status: "completed",
        createdAt: "2026-05-23T00:00:00.000Z",
      },
    ]);

    expect(await loadHistory()).toHaveLength(1);
    expect((await loadHistory())[0]).not.toHaveProperty("audioPath");
  });

  it("returns a mock recording and recognition result", async () => {
    await startRecording();
    const recording = await stopRecording();
    const result = await recognizeSpeech(recording.audioRef);

    expect(recording.audioRef).toMatch(/^mock-audio-/);
    expect(result.text).toContain("这是一个模拟语音识别结果");
    expect(result.provider).toBe("mock");
  });

  it("falls back to navigator clipboard for copy and insert", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyText("复制文本");
    await insertText("插入文本");

    expect(writeText).toHaveBeenCalledWith("复制文本");
    expect(writeText).toHaveBeenCalledWith("插入文本");
  });
});
