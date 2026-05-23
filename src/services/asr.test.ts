import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const listenMock = vi.fn();
const unlistenMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

describe("asr service", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    unlistenMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    listenMock.mockResolvedValue(unlistenMock);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("encodes Uint8Array to base64", async () => {
    const { bytesToBase64 } = await import("./asr");
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(bytesToBase64(bytes)).toBe(btoa("\x00\x01\x02\xfa\xff"));
  });

  it("registers a transcription listener and starts the session via Tauri", async () => {
    const { startAsrSession } = await import("./asr");

    await startAsrSession({
      apiKey: "sk-abc",
      endpoint: "wss://example/realtime",
      model: "qwen3-asr-flash-realtime",
      language: "zh",
    });

    expect(listenMock).toHaveBeenCalledWith("asr-transcription", expect.any(Function));
    expect(invokeMock).toHaveBeenCalledWith("asr_start", {
      apiKey: "sk-abc",
      endpoint: "wss://example/realtime",
      model: "qwen3-asr-flash-realtime",
      language: "zh",
    });
  });

  it("invokes appendAudio with base64-encoded payload", async () => {
    const { startAsrSession, bytesToBase64 } = await import("./asr");

    const handle = await startAsrSession({
      apiKey: "x",
      endpoint: "",
      model: "m",
      language: "zh",
    });

    const bytes = new Uint8Array([1, 2, 3]);
    await handle.appendAudio(bytes);

    expect(invokeMock).toHaveBeenCalledWith("asr_append_audio", {
      audioB64: bytesToBase64(bytes),
    });
  });

  it("invokes stop and cancel", async () => {
    const { startAsrSession } = await import("./asr");
    const handle = await startAsrSession({
      apiKey: "x",
      endpoint: "",
      model: "m",
      language: "zh",
    });

    await handle.stop();
    expect(invokeMock).toHaveBeenCalledWith("asr_stop");

    await handle.cancel();
    expect(invokeMock).toHaveBeenCalledWith("asr_cancel");
  });

  it("dispatches transcription events to the right listener", async () => {
    const { startAsrSession } = await import("./asr");
    const onDelta = vi.fn();
    const onCompleted = vi.fn();
    const onError = vi.fn();
    const onSessionFinished = vi.fn();

    await startAsrSession(
      { apiKey: "x", endpoint: "", model: "m", language: "zh" },
      { onDelta, onCompleted, onError, onSessionFinished },
    );

    const handler = listenMock.mock.calls[0][1] as (event: { payload: unknown }) => void;

    handler({ payload: { kind: "delta", text: "你" } });
    handler({ payload: { kind: "delta", text: "你好" } });
    handler({ payload: { kind: "completed", text: "你好世界" } });
    handler({ payload: { kind: "error", message: "boom" } });
    handler({ payload: { kind: "session_finished" } });

    expect(onDelta).toHaveBeenNthCalledWith(1, "你");
    expect(onDelta).toHaveBeenNthCalledWith(2, "你好");
    expect(onCompleted).toHaveBeenCalledWith("你好世界");
    expect(onError).toHaveBeenCalledWith("boom");
    expect(onSessionFinished).toHaveBeenCalled();
  });

  it("unlistens when asr_start fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("ws failed"));
    const { startAsrSession } = await import("./asr");

    await expect(
      startAsrSession({ apiKey: "x", endpoint: "", model: "m", language: "zh" }),
    ).rejects.toThrow("ws failed");

    expect(unlistenMock).toHaveBeenCalled();
  });
});
