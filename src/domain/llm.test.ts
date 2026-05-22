import { describe, expect, it } from "vitest";
import { buildChatCompletionRequest, parseChatCompletionResponse } from "./llm";

describe("llm", () => {
  it("builds an OpenAI-compatible chat completions request", () => {
    const request = buildChatCompletionRequest({
      model: "gpt-test",
      temperature: 0.2,
      system: "系统提示",
      user: "用户提示",
    });

    expect(request).toEqual({
      model: "gpt-test",
      temperature: 0.2,
      stream: false,
      messages: [
        { role: "system", content: "系统提示" },
        { role: "user", content: "用户提示" },
      ],
    });
  });

  it("parses the first assistant message", () => {
    const text = parseChatCompletionResponse({
      choices: [{ message: { role: "assistant", content: "润色结果" } }],
    });

    expect(text).toBe("润色结果");
  });

  it("rejects empty assistant content", () => {
    expect(() =>
      parseChatCompletionResponse({
        choices: [{ message: { role: "assistant", content: "   " } }],
      }),
    ).toThrow("LLM returned empty content");
  });
});
