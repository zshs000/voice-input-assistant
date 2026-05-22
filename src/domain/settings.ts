import { ORIGINAL_TEMPLATE_ID, type PromptTemplate } from "./templates";

export type OutputMode = "copy" | "insert" | "copy-and-insert";

export type LlmSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
};

export type SttSettings = {
  provider: "mock" | "cloud";
  endpoint: string;
  apiKey: string;
};

export type AppSettings = {
  stt: SttSettings;
  llm: LlmSettings;
  defaultTemplateId: string;
  outputMode: OutputMode;
  hotkey: string;
  customTemplates: PromptTemplate[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  stt: {
    provider: "mock",
    endpoint: "",
    apiKey: "",
  },
  llm: {
    baseUrl: "",
    apiKey: "",
    model: "gpt-4o-mini",
    temperature: 0.3,
  },
  defaultTemplateId: "clean",
  outputMode: "copy",
  hotkey: "Ctrl+Alt+Space",
  customTemplates: [],
};

function normalizeTemperature(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_SETTINGS.llm.temperature;
  }

  return Math.min(2, Math.max(0, value));
}

function isOutputMode(value: unknown): value is OutputMode {
  return value === "copy" || value === "insert" || value === "copy-and-insert";
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\/+$/, "");
}

export function normalizeSettings(value: unknown): AppSettings {
  const input = (value ?? {}) as Partial<AppSettings>;
  const llm = (input.llm ?? {}) as Partial<LlmSettings>;
  const stt = (input.stt ?? {}) as Partial<SttSettings>;
  const customTemplates = Array.isArray(input.customTemplates)
    ? input.customTemplates.filter(
        (template): template is PromptTemplate =>
          Boolean(template) &&
          typeof template.id === "string" &&
          typeof template.name === "string" &&
          template.category === "custom" &&
          typeof template.userPromptTemplate === "string",
      )
    : [];

  return {
    stt: {
      provider: stt.provider === "cloud" ? "cloud" : "mock",
      endpoint: typeof stt.endpoint === "string" ? stt.endpoint.trim() : "",
      apiKey: typeof stt.apiKey === "string" ? stt.apiKey.trim() : "",
    },
    llm: {
      baseUrl: normalizeBaseUrl(llm.baseUrl),
      apiKey: typeof llm.apiKey === "string" ? llm.apiKey.trim() : "",
      model:
        typeof llm.model === "string" && llm.model.trim()
          ? llm.model.trim()
          : DEFAULT_SETTINGS.llm.model,
      temperature: normalizeTemperature(llm.temperature),
    },
    defaultTemplateId:
      typeof input.defaultTemplateId === "string" && input.defaultTemplateId.trim()
        ? input.defaultTemplateId.trim()
        : DEFAULT_SETTINGS.defaultTemplateId,
    outputMode: isOutputMode(input.outputMode) ? input.outputMode : DEFAULT_SETTINGS.outputMode,
    hotkey:
      typeof input.hotkey === "string" && input.hotkey.trim()
        ? input.hotkey.trim()
        : DEFAULT_SETTINGS.hotkey,
    customTemplates,
  };
}

export function isOriginalMode(settings: AppSettings): boolean {
  return settings.defaultTemplateId === ORIGINAL_TEMPLATE_ID;
}
