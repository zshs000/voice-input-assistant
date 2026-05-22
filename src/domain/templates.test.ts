import { describe, expect, it } from "vitest";
import {
  BUILT_IN_TEMPLATES,
  ORIGINAL_TEMPLATE_ID,
  createCustomTemplate,
  findTemplate,
  getAvailableTemplates,
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

  it("creates an enabled custom template with the shared system prompt", () => {
    const template = createCustomTemplate({
      name: "小红书",
      description: "自然笔记",
      userPromptTemplate: "请改写：{{input}}",
    });

    expect(template.id).toMatch(/^custom_/);
    expect(template.category).toBe("custom");
    expect(template.enabled).toBe(true);
    expect(template.usesLlm).toBe(true);
    expect(renderPrompt(template, "测试文本").user).toContain("测试文本");
  });

  it("merges enabled custom templates after built-in templates", () => {
    const custom = createCustomTemplate({
      name: "启用模板",
      description: "",
      userPromptTemplate: "{{input}}",
    });
    const disabled = { ...custom, id: "custom_disabled", enabled: false };

    const templates = getAvailableTemplates([disabled, custom]);

    expect(templates[templates.length - 1]?.id).toBe(custom.id);
    expect(templates.some((template) => template.id === disabled.id)).toBe(false);
  });
});
