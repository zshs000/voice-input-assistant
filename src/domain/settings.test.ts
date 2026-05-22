import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("settings", () => {
  it("provides safe defaults for a first run", () => {
    expect(DEFAULT_SETTINGS.outputMode).toBe("copy");
    expect(DEFAULT_SETTINGS.defaultTemplateId).toBe("clean");
    expect(DEFAULT_SETTINGS.llm.temperature).toBe(0.3);
    expect(DEFAULT_SETTINGS.customTemplates).toEqual([]);
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
});
