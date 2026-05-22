import { describe, expect, it } from "vitest";
import {
  BUILT_IN_TEMPLATES,
  ORIGINAL_TEMPLATE_ID,
  findTemplate,
  renderPrompt,
  validateCustomTemplate,
} from "./templates";

describe("templates", () => {
  it("renders the selected prompt with voice input text", () => {
    const template = findTemplate("formal");

    const prompt = renderPrompt(template, "这个地方可能有点问题");

    expect(prompt.system).toContain("中文语音输入文本优化助手");
    expect(prompt.user).toContain("这个地方可能有点问题");
    expect(prompt.user).not.toContain("{{input}}");
  });

  it("keeps the original template as a non-LLM mode", () => {
    const template = findTemplate(ORIGINAL_TEMPLATE_ID);

    expect(template.usesLlm).toBe(false);
  });

  it("requires custom templates to include the input placeholder", () => {
    const result = validateCustomTemplate({
      name: "自定义",
      userPromptTemplate: "请改写这段话",
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain("{{input}}");
  });

  it("defines unique built-in template ids", () => {
    const ids = BUILT_IN_TEMPLATES.map((template) => template.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
