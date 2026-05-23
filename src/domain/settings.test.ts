import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHSCOPE_LANGUAGE,
  DEFAULT_DASHSCOPE_MODEL,
  DEFAULT_SETTINGS,
  normalizeSettings,
} from "./settings";

describe("settings", () => {
  it("provides safe defaults for a first run", () => {
    expect(DEFAULT_SETTINGS.outputMode).toBe("copy");
    expect(DEFAULT_SETTINGS.defaultTemplateId).toBe("clean");
    expect(DEFAULT_SETTINGS.llm.temperature).toBe(0.3);
    expect(DEFAULT_SETTINGS.customTemplates).toEqual([]);
    expect(DEFAULT_SETTINGS.stt.provider).toBe("dashscope");
    expect(DEFAULT_SETTINGS.stt.model).toBe(DEFAULT_DASHSCOPE_MODEL);
    expect(DEFAULT_SETTINGS.stt.language).toBe(DEFAULT_DASHSCOPE_LANGUAGE);
  });

  it("normalizes partial persisted settings", () => {
    const settings = normalizeSettings({
      llm: {
        baseUrl: " https://api.example.com/v1/ ",
        apiKey: " secret ",
        model: "",
        temperature: 9,
      },
      outputMode: "insert",
      customTemplates: [
        {
          id: "custom_1",
          name: "自定义",
          description: "",
          category: "custom",
          enabled: true,
          usesLlm: true,
          systemPrompt: "系统",
          userPromptTemplate: "{{input}}",
        },
      ],
    });

    expect(settings.llm.baseUrl).toBe("https://api.example.com/v1");
    expect(settings.llm.apiKey).toBe("secret");
    expect(settings.llm.model).toBe(DEFAULT_SETTINGS.llm.model);
    expect(settings.llm.temperature).toBe(2);
    expect(settings.outputMode).toBe("insert");
    expect(settings.customTemplates).toHaveLength(1);
  });

  it("falls back to default model and language when stt fields are missing", () => {
    const settings = normalizeSettings({
      stt: { provider: "dashscope", apiKey: "sk-abc" },
    });

    expect(settings.stt.provider).toBe("dashscope");
    expect(settings.stt.apiKey).toBe("sk-abc");
    expect(settings.stt.model).toBe(DEFAULT_DASHSCOPE_MODEL);
    expect(settings.stt.language).toBe(DEFAULT_DASHSCOPE_LANGUAGE);
  });

  it("rejects unknown stt provider and falls back to mock", () => {
    const settings = normalizeSettings({ stt: { provider: "azure" } });
    expect(settings.stt.provider).toBe("mock");
  });
});
