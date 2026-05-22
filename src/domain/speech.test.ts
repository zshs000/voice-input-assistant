import { describe, expect, it } from "vitest";
import { createMockSpeechRecognitionProvider } from "./speech";

describe("speech providers", () => {
  it("recognizes audio through the mock provider contract", async () => {
    const provider = createMockSpeechRecognitionProvider();

    const result = await provider.recognize("mock-audio-1");

    expect(provider.id).toBe("mock");
    expect(result.provider).toBe("mock");
    expect(result.text).toContain("模拟语音识别结果");
  });
});
