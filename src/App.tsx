import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clipboard,
  Keyboard,
  Mic,
  Play,
  RefreshCcw,
  Save,
  Send,
  Settings,
  Square,
} from "lucide-react";
import { addHistoryItem, createHistoryItem, type HistoryItem } from "./domain/history";
import { polishWithOpenAICompatible } from "./domain/llm";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type OutputMode,
} from "./domain/settings";
import {
  createCustomTemplate,
  findTemplate,
  getAvailableTemplates,
  renderPrompt,
  validateCustomTemplate,
  type PromptTemplate,
} from "./domain/templates";
import {
  copyText,
  insertText,
  isTauriRuntime,
  loadHistory,
  loadSettings,
  saveHistory,
  saveSettings,
} from "./services/tauri";
import { PcmRecorder } from "./services/recorder";
import { startAsrSession, type AsrSessionHandle } from "./services/asr";

type AppStatus = "idle" | "recording" | "recognizing" | "polishing" | "completed" | "failed";

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: "待机中",
  recording: "录音中",
  recognizing: "识别中",
  polishing: "润色中",
  completed: "已完成",
  failed: "失败",
};

const OUTPUT_MODE_LABELS: Record<OutputMode, string> = {
  copy: "仅复制",
  insert: "自动插入",
  "copy-and-insert": "复制并插入",
};

const MOCK_RECOGNIZED_TEXT = "这是一段模拟的中文识别结果，可在设置中切换为 DashScope 实时识别。";
const ASR_FINAL_TIMEOUT_MS = 8000;

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }
  return fallback;
}

export function App() {
  const [status, setStatus] = useState<AppStatus>("idle");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [selectedTemplateId, setSelectedTemplateId] = useState(DEFAULT_SETTINGS.defaultTemplateId);
  const [recognizedText, setRecognizedText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [message, setMessage] = useState("准备录音。");
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [customTemplatePrompt, setCustomTemplatePrompt] = useState("请改写以下内容：\n{{input}}");

  const recorderRef = useRef<PcmRecorder | null>(null);
  const asrHandleRef = useRef<AsrSessionHandle | null>(null);
  const finalTranscriptResolverRef = useRef<((text: string) => void) | null>(null);
  const partialTranscriptRef = useRef<string>("");

  const templates = useMemo(() => getAvailableTemplates(settings.customTemplates), [settings.customTemplates]);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? findTemplate(selectedTemplateId),
    [selectedTemplateId, templates],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const [persistedSettings, persistedHistory] = await Promise.all([
        loadSettings(),
        loadHistory(),
      ]);

      if (cancelled) {
        return;
      }

      setSettings(persistedSettings);
      setSelectedTemplateId(persistedSettings.defaultTemplateId);
      setHistory(persistedHistory);
    }

    hydrate().catch((error: unknown) => {
      setMessage(toErrorMessage(error, "加载本地配置失败。"));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function persistHistory(nextHistory: HistoryItem[]) {
    setHistory(nextHistory);
    await saveHistory(nextHistory);
  }

  async function polishRecognizedText(template: PromptTemplate, text: string): Promise<string> {
    if (!template.usesLlm) {
      return text;
    }

    if (!settings.llm.baseUrl || !settings.llm.apiKey || !settings.llm.model) {
      setMessage("LLM 未配置，已使用原始识别文本。");
      return text;
    }

    const prompt = renderPrompt(template, text);

    try {
      return await polishWithOpenAICompatible({
        baseUrl: settings.llm.baseUrl,
        apiKey: settings.llm.apiKey,
        model: settings.llm.model,
        temperature: settings.llm.temperature,
        system: prompt.system,
        user: prompt.user,
      });
    } catch (error) {
      setMessage(error instanceof Error ? `润色失败：${error.message}` : `润色失败：${toErrorMessage(error, "已保留原文")}`);
      return text;
    }
  }

  async function outputText(text: string, mode: OutputMode) {
    if (!text.trim()) {
      return;
    }

    if (mode === "copy") {
      await copyText(text);
      return;
    }

    if (mode === "insert") {
      await insertText(text);
      return;
    }

    await copyText(text);
    await insertText(text);
  }

  async function completeInput(text: string, template: PromptTemplate) {
    setStatus(template.usesLlm ? "polishing" : "recognizing");
    const polished = await polishRecognizedText(template, text);
    setFinalText(polished);
    await outputText(polished, settings.outputMode);

    const item = createHistoryItem({
      recognizedText: text,
      finalText: polished,
      templateId: template.id,
      status: "completed",
      createdAt: new Date().toISOString(),
    });
    await persistHistory(addHistoryItem(history, item));
    setStatus("completed");
    setMessage("文本已输出。");
  }

  async function cleanupAsr() {
    if (recorderRef.current) {
      try {
        await recorderRef.current.stop();
      } catch {
        // ignore
      }
      recorderRef.current = null;
    }
    if (asrHandleRef.current) {
      try {
        await asrHandleRef.current.cancel();
      } catch {
        // ignore
      }
      asrHandleRef.current.unlisten();
      asrHandleRef.current = null;
    }
    finalTranscriptResolverRef.current = null;
  }

  async function startDashscopeRecording() {
    if (!isTauriRuntime()) {
      throw new Error("DashScope 识别需要在桌面应用中运行。");
    }

    if (!settings.stt.apiKey) {
      throw new Error("未配置 DashScope API Key。");
    }

    partialTranscriptRef.current = "";

    const handle = await startAsrSession(
      {
        apiKey: settings.stt.apiKey,
        endpoint: settings.stt.endpoint,
        model: settings.stt.model,
        language: settings.stt.language,
      },
      {
        onDelta: (text) => {
          partialTranscriptRef.current = text;
          setRecognizedText(text);
        },
        onCompleted: (text) => {
          partialTranscriptRef.current = text;
          setRecognizedText(text);
          finalTranscriptResolverRef.current?.(text);
          finalTranscriptResolverRef.current = null;
        },
        onError: (msg) => {
          setMessage(`识别失败：${msg}`);
          finalTranscriptResolverRef.current?.(partialTranscriptRef.current);
          finalTranscriptResolverRef.current = null;
        },
        onSessionFinished: () => {
          finalTranscriptResolverRef.current?.(partialTranscriptRef.current);
          finalTranscriptResolverRef.current = null;
        },
      },
    );
    asrHandleRef.current = handle;

    const recorder = new PcmRecorder();
    try {
      await recorder.start({
        onChunk: (bytes) => {
          handle.appendAudio(bytes).catch(() => {
            // 上层会通过 onError 事件感知；这里吞掉单帧失败
          });
        },
      });
    } catch (error) {
      await cleanupAsr();
      throw error;
    }
    recorderRef.current = recorder;
  }

  async function stopDashscopeRecording(): Promise<string> {
    if (recorderRef.current) {
      try {
        await recorderRef.current.stop();
      } catch {
        // ignore
      }
      recorderRef.current = null;
    }

    const handle = asrHandleRef.current;
    if (!handle) {
      return partialTranscriptRef.current;
    }

    const finalPromise = new Promise<string>((resolve) => {
      finalTranscriptResolverRef.current = resolve;
      setTimeout(() => {
        if (finalTranscriptResolverRef.current === resolve) {
          finalTranscriptResolverRef.current = null;
          resolve(partialTranscriptRef.current);
        }
      }, ASR_FINAL_TIMEOUT_MS);
    });

    try {
      await handle.stop();
    } catch (error) {
      finalTranscriptResolverRef.current?.(partialTranscriptRef.current);
      finalTranscriptResolverRef.current = null;
      throw error;
    }

    const finalText = await finalPromise;
    handle.unlisten();
    asrHandleRef.current = null;
    return finalText;
  }

  async function handleRecordClick() {
    if (status === "recording") {
      setStatus("recognizing");
      setMessage("正在等待最终识别结果。");

      try {
        if (settings.stt.provider === "mock") {
          setRecognizedText(MOCK_RECOGNIZED_TEXT);
          await completeInput(MOCK_RECOGNIZED_TEXT, selectedTemplate);
          return;
        }

        const text = await stopDashscopeRecording();
        if (!text.trim()) {
          setStatus("failed");
          setMessage("未识别到有效语音。");
          return;
        }
        await completeInput(text, selectedTemplate);
      } catch (error) {
        setStatus("failed");
        setMessage(toErrorMessage(error, "录音处理失败。"));
        await cleanupAsr();
      }
      return;
    }

    try {
      setRecognizedText("");
      setFinalText("");
      partialTranscriptRef.current = "";
      setMessage("正在录音。");

      if (settings.stt.provider === "dashscope") {
        await startDashscopeRecording();
      }

      setStatus("recording");
    } catch (error) {
      setStatus("failed");
      setMessage(toErrorMessage(error, "无法开始录音。"));
      await cleanupAsr();
    }
  }

  async function handleRepolish() {
    if (!recognizedText.trim()) {
      return;
    }

    try {
      await completeInput(recognizedText, selectedTemplate);
    } catch (error) {
      setStatus("failed");
      setMessage(toErrorMessage(error, "重新润色失败。"));
    }
  }

  async function handleManualCopy() {
    await copyText(finalText || recognizedText);
    setMessage("已复制到剪贴板。");
  }

  async function handleManualInsert() {
    await insertText(finalText || recognizedText);
    setMessage("已尝试插入；如果目标窗口未接收，可手动粘贴剪贴板内容。");
  }

  async function handleSaveSettings() {
    const normalized = normalizeSettings({ ...settings, defaultTemplateId: selectedTemplateId });
    setSettings(normalized);
    setSelectedTemplateId(normalized.defaultTemplateId);
    await saveSettings(normalized);
    setMessage("设置已保存。");
  }

  async function handleAddCustomTemplate() {
    const validation = validateCustomTemplate({
      name: customTemplateName,
      userPromptTemplate: customTemplatePrompt,
    });

    if (!validation.valid) {
      setMessage(validation.message);
      return;
    }

    const template = createCustomTemplate({
      name: customTemplateName,
      description: "用户自定义润色模板",
      userPromptTemplate: customTemplatePrompt,
    });
    const nextSettings = normalizeSettings({
      ...settings,
      customTemplates: [...settings.customTemplates, template],
      defaultTemplateId: template.id,
    });

    setSettings(nextSettings);
    setSelectedTemplateId(template.id);
    setCustomTemplateName("");
    await saveSettings(nextSettings);
    setMessage("自定义模板已保存。");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Voice Input Assistant</p>
          <h1>语音输入助手</h1>
        </div>
        <div className={`status-pill status-${status}`}>{STATUS_LABELS[status]}</div>
      </header>

      <section className="workspace">
        <section className="panel input-panel" aria-label="录音输入">
          <div className="record-block">
            <button
              className="record-button"
              type="button"
              onClick={handleRecordClick}
              aria-pressed={status === "recording"}
            >
              {status === "recording" ? <Square size={24} /> : <Mic size={24} />}
              {status === "recording" ? "结束录音" : "开始录音"}
            </button>
            <p className="helper">{message}</p>
          </div>

          <div className="control-grid">
            <label>
              <span>润色模板</span>
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>输出方式</span>
              <select
                value={settings.outputMode}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    outputMode: event.target.value as OutputMode,
                  }))
                }
              >
                {Object.entries(OUTPUT_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="hotkey-row">
            <Keyboard size={16} />
            <span>{settings.hotkey}</span>
          </div>
        </section>

        <section className="panel result-panel" aria-label="文本结果">
          <div className="section-title">
            <h2>文本结果</h2>
            <button type="button" onClick={handleRepolish} disabled={!recognizedText.trim()}>
              <RefreshCcw size={16} />
              重新润色
            </button>
          </div>

          <label>
            <span>原始识别文本</span>
            <textarea
              value={recognizedText}
              onChange={(event) => setRecognizedText(event.target.value)}
              placeholder="录音结束后显示识别文本，也可以手动输入测试。"
            />
          </label>

          <label>
            <span>最终输出文本</span>
            <textarea
              value={finalText}
              onChange={(event) => setFinalText(event.target.value)}
              placeholder="AI 润色或原文模式输出结果。"
            />
          </label>

          <div className="button-row">
            <button type="button" onClick={handleManualCopy} disabled={!recognizedText && !finalText}>
              <Clipboard size={16} />
              复制
            </button>
            <button type="button" onClick={handleManualInsert} disabled={!recognizedText && !finalText}>
              <Send size={16} />
              插入
            </button>
          </div>
        </section>

        <aside className="side-column">
          <section className="panel settings-panel" aria-label="设置">
            <div className="section-title">
              <h2>设置</h2>
              <Settings size={18} />
            </div>

            <label>
              <span>LLM Base URL</span>
              <input
                value={settings.llm.baseUrl}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    llm: { ...current.llm, baseUrl: event.target.value },
                  }))
                }
                placeholder="https://api.example.com/v1"
              />
            </label>

            <label>
              <span>API Key</span>
              <input
                type="password"
                value={settings.llm.apiKey}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    llm: { ...current.llm, apiKey: event.target.value },
                  }))
                }
                placeholder="sk-..."
              />
            </label>

            <label>
              <span>Model</span>
              <input
                value={settings.llm.model}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    llm: { ...current.llm, model: event.target.value },
                  }))
                }
              />
            </label>

            <label>
              <span>Temperature</span>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={settings.llm.temperature}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    llm: { ...current.llm, temperature: Number(event.target.value) },
                  }))
                }
              />
            </label>

            <label>
              <span>STT Provider</span>
              <select
                value={settings.stt.provider}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    stt: {
                      ...current.stt,
                      provider: event.target.value === "dashscope" ? "dashscope" : "mock",
                    },
                  }))
                }
              >
                <option value="dashscope">DashScope (Qwen-ASR)</option>
                <option value="mock">Mock</option>
              </select>
            </label>

            <label>
              <span>DashScope API Key</span>
              <input
                type="password"
                value={settings.stt.apiKey}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    stt: { ...current.stt, apiKey: event.target.value },
                  }))
                }
                placeholder="sk-..."
              />
            </label>

            <label>
              <span>ASR Model</span>
              <input
                value={settings.stt.model}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    stt: { ...current.stt, model: event.target.value },
                  }))
                }
                placeholder="qwen3-asr-flash-realtime"
              />
            </label>

            <label>
              <span>识别语言</span>
              <input
                value={settings.stt.language}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    stt: { ...current.stt, language: event.target.value },
                  }))
                }
                placeholder="zh"
              />
            </label>

            <div className="subsection">
              <h3>自定义模板</h3>
              <label>
                <span>自定义模板名称</span>
                <input
                  value={customTemplateName}
                  onChange={(event) => setCustomTemplateName(event.target.value)}
                  placeholder="例如：小红书笔记"
                />
              </label>
              <label>
                <span>自定义提示词</span>
                <textarea
                  value={customTemplatePrompt}
                  onChange={(event) => setCustomTemplatePrompt(event.target.value)}
                />
              </label>
              <button type="button" onClick={handleAddCustomTemplate}>
                <Play size={16} />
                添加模板
              </button>
            </div>

            <button type="button" onClick={handleSaveSettings}>
              <Save size={16} />
              保存设置
            </button>
          </section>

          <section className="panel history-panel" aria-label="最近历史">
            <h2>最近历史</h2>
            {history.length === 0 ? (
              <p className="empty">暂无历史记录。</p>
            ) : (
              <ol className="history-list">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setRecognizedText(item.recognizedText);
                        setFinalText(item.finalText);
                        setSelectedTemplateId(item.templateId);
                      }}
                    >
                      <span>{item.finalText}</span>
                      <time>{new Date(item.createdAt).toLocaleString()}</time>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}
