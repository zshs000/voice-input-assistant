import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("settings", () => {
  it("provides safe defaults for a first run", () => {
    expect(DEFAULT_SETTINGS.outputMode).toBe("copy");
    expect(DEFAULT_SETTINGS.defaultTemplateId).toBe("clean");
    expect(DEFAULT_SETTINGS.llm.temperature).toBe(0.3);
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
    });

    expect(settings.llm.baseUrl).toBe("https://api.example.com/v1");
    expect(settings.llm.apiKey).toBe("secret");
    expect(settings.llm.model).toBe(DEFAULT_SETTINGS.llm.model);
    expect(settings.llm.temperature).toBe(2);
    expect(settings.outputMode).toBe("insert");
  });
});
