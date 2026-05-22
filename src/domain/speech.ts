export type SpeechRecognitionResult = {
  text: string;
  durationMs?: number;
  provider: string;
};

export type SpeechRecognitionProvider = {
  id: string;
  name: string;
  recognize(audioRef: string): Promise<SpeechRecognitionResult>;
};

export function createMockSpeechRecognitionProvider(): SpeechRecognitionProvider {
  return {
    id: "mock",
    name: "Mock STT",
    async recognize(audioRef: string) {
      return {
        text: `这是一个模拟语音识别结果，来源音频引用：${audioRef}。`,
        durationMs: 1000,
        provider: "mock",
      };
    },
  };
}
