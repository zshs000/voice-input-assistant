export const ORIGINAL_TEMPLATE_ID = "original";

export type TemplateCategory = "builtin" | "custom";

export type PromptTemplate = {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  enabled: boolean;
  usesLlm: boolean;
  systemPrompt: string;
  userPromptTemplate: string;
};

export type CreateCustomTemplateInput = {
  name: string;
  description: string;
  userPromptTemplate: string;
};

export type RenderedPrompt = {
  system: string;
  user: string;
};

const BASE_SYSTEM_PROMPT =
  "你是一个中文语音输入文本优化助手。你的任务是将语音识别得到的中文文本整理成更适合用户当前场景的最终文本。\n\n" +
  "要求：\n" +
  "1. 保留用户原意，不添加不存在的信息。\n" +
  "2. 可以删除口头禅、无意义重复和明显语音识别噪声。\n" +
  "3. 可以修正明显错别字、语病和标点问题。\n" +
  "4. 不要解释你的修改过程。\n" +
  "5. 只输出最终文本，不要输出标题、说明、引号或 Markdown，除非模板明确要求条目格式。";

export const BUILT_IN_TEMPLATES: PromptTemplate[] = [
  {
    id: ORIGINAL_TEMPLATE_ID,
    name: "原文模式",
    description: "不调用 AI，直接使用语音识别结果。",
    category: "builtin",
    enabled: true,
    usesLlm: false,
    systemPrompt: "",
    userPromptTemplate: "{{input}}",
  },
  {
    id: "clean",
    name: "去除口语",
    description: "删除口头禅、重复和停顿词，尽量保持原句表达。",
    category: "builtin",
    enabled: true,
    usesLlm: true,
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPromptTemplate:
      "请将下面这段语音识别文本进行轻量清理：\n\n" +
      "规则：\n" +
      "1. 删除口头禅，例如“嗯”“啊”“那个”“就是说”“然后然后”等。\n" +
      "2. 删除无意义重复。\n" +
      "3. 修正明显的标点和语病。\n" +
      "4. 尽量保持原来的句式和语气。\n" +
      "5. 不要大幅改写，不要扩写。\n\n" +
      "原文：\n{{input}}",
  },
  {
    id: "formal",
    name: "正式表达",
    description: "改写为更正式、清晰、适合书面表达的中文。",
    category: "builtin",
    enabled: true,
    usesLlm: true,
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPromptTemplate:
      "请将下面这段语音识别文本改写为正式、清晰、适合书面表达的中文：\n\n" +
      "规则：\n" +
      "1. 保留原意，不添加新事实。\n" +
      "2. 删除口语词和无意义重复。\n" +
      "3. 调整语序，使表达更有逻辑。\n" +
      "4. 语气保持客观、礼貌、正式。\n" +
      "5. 输出一段可直接使用的正文。\n\n" +
      "原文：\n{{input}}",
  },
  {
    id: "concise",
    name: "简洁表达",
    description: "压缩冗余内容，保留核心意思。",
    category: "builtin",
    enabled: true,
    usesLlm: true,
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPromptTemplate:
      "请将下面这段语音识别文本压缩为简洁、清楚的中文表达：\n\n" +
      "规则：\n" +
      "1. 保留核心意思。\n" +
      "2. 删除冗余铺垫、重复和口头禅。\n" +
      "3. 尽量缩短句子。\n" +
      "4. 不改变用户原本的判断和态度。\n" +
      "5. 只输出压缩后的文本。\n\n" +
      "原文：\n{{input}}",
  },
  {
    id: "chat",
    name: "聊天表达",
    description: "改写为自然、轻松、适合聊天发送的中文。",
    category: "builtin",
    enabled: true,
    usesLlm: true,
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPromptTemplate:
      "请将下面这段语音识别文本改写成自然、轻松、适合聊天发送的中文：\n\n" +
      "规则：\n" +
      "1. 保留原意。\n" +
      "2. 删除明显口头禅和重复。\n" +
      "3. 语气自然，不要太正式。\n" +
      "4. 不要使用夸张、油腻或过度热情的表达。\n" +
      "5. 输出可以直接发送的聊天文本。\n\n" +
      "原文：\n{{input}}",
  },
  {
    id: "meeting",
    name: "会议/课堂要点",
    description: "将较长语音整理为清晰条目。",
    category: "builtin",
    enabled: true,
    usesLlm: true,
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPromptTemplate:
      "请将下面这段语音识别文本整理为清晰的要点：\n\n" +
      "规则：\n" +
      "1. 保留原文中的关键信息。\n" +
      "2. 删除口头禅、重复和无意义内容。\n" +
      "3. 使用简洁条目呈现。\n" +
      "4. 如果包含任务，请明确任务内容。\n" +
      "5. 不要添加原文没有的信息。\n\n" +
      "原文：\n{{input}}",
  },
];

export function findTemplate(id: string): PromptTemplate {
  return BUILT_IN_TEMPLATES.find((template) => template.id === id) ?? BUILT_IN_TEMPLATES[1];
}

export function getAvailableTemplates(customTemplates: PromptTemplate[] = []): PromptTemplate[] {
  return [
    ...BUILT_IN_TEMPLATES,
    ...customTemplates.filter(
      (template) => template.category === "custom" && template.enabled && template.userPromptTemplate.includes("{{input}}"),
    ),
  ];
}

export function createCustomTemplate(input: CreateCustomTemplateInput): PromptTemplate {
  const now = Date.now();

  return {
    id: `custom_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim(),
    description: input.description.trim(),
    category: "custom",
    enabled: true,
    usesLlm: true,
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPromptTemplate: input.userPromptTemplate.trim(),
  };
}

export function renderPrompt(template: PromptTemplate, input: string): RenderedPrompt {
  return {
    system: template.systemPrompt,
    user: template.userPromptTemplate.split("{{input}}").join(input.trim()),
  };
}

export function validateCustomTemplate(input: {
  name: string;
  userPromptTemplate: string;
}): { valid: true; message?: undefined } | { valid: false; message: string } {
  if (!input.name.trim()) {
    return { valid: false, message: "模板名称不能为空。" };
  }

  if (!input.userPromptTemplate.includes("{{input}}")) {
    return { valid: false, message: "自定义模板必须包含 {{input}} 占位符。" };
  }

  return { valid: true };
}
