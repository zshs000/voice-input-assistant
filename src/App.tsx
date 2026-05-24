import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clipboard,
  Keyboard,
  Maximize2,
  Mic,
  Minimize2,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { addHistoryItem, createHistoryItem, type HistoryItem } from "./domain/history";
import { polishWithOpenAICompatible } from "./domain/llm";
import { isRecordingTooShort, MIN_RECORDING_DURATION_MS } from "./domain/recording";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type OutputMode,
} from "./domain/settings";
import {
  createCustomTemplate,
  EXAMPLE_TEMPLATES,
  findTemplate,
  getAvailableTemplates,
  PROMPT_PREVIEW_SAMPLE,
  removeCustomTemplate,
  renderPrompt,
  updateCustomTemplate,
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
import { setWindowMode as applyWindowMode, type WindowMode } from "./services/window";
import { register as registerShortcut, unregister as unregisterShortcut } from "@tauri-apps/plugin-global-shortcut";

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
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [windowMode, setWindowMode] = useState<WindowMode>("full");

  const recorderRef = useRef<PcmRecorder | null>(null);
  const asrHandleRef = useRef<AsrSessionHandle | null>(null);
  const finalTranscriptResolverRef = useRef<((text: string) => void) | null>(null);
  const partialTranscriptRef = useRef<string>("");
  const handleRecordClickRef = useRef<() => Promise<void>>(async () => {});
  const recordingStartedAtRef = useRef<number>(0);
  const statusRef = useRef<AppStatus>("idle");
  const startRecordingFlowRef = useRef<() => Promise<void>>(async () => {});
  const stopRecordingFlowRef = useRef<() => Promise<void>>(async () => {});
  const isHoldPressedRef = useRef<boolean>(false);

  const templates = useMemo(() => getAvailableTemplates(settings.customTemplates), [settings.customTemplates]);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? findTemplate(selectedTemplateId),
    [selectedTemplateId, templates],
  );
  const previewPrompt = useMemo(() => {
    if (!customTemplatePrompt.includes("{{input}}")) {
      return "";
    }
    return customTemplatePrompt.split("{{input}}").join(PROMPT_PREVIEW_SAMPLE);
  }, [customTemplatePrompt]);

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

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  useEffect(() => {
    handleRecordClickRef.current = handleRecordClick;
    statusRef.current = status;
    startRecordingFlowRef.current = startRecordingFlow;
    stopRecordingFlowRef.current = stopRecordingFlow;
  });

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    const accelerator = settings.hotkey?.trim();
    if (!accelerator) {
      return;
    }
    const mode = settings.hotkeyMode;

    let cancelled = false;
    isHoldPressedRef.current = false;

    (async () => {
      try {
        await registerShortcut(accelerator, (event) => {
          if (cancelled) return;

          if (mode === "toggle") {
            if (event.state === "Pressed") {
              void handleRecordClickRef.current();
            }
            return;
          }

          // hold 模式：按下开始 / 松开停止
          if (event.state === "Pressed") {
            if (isHoldPressedRef.current) return;
            isHoldPressedRef.current = true;
            void (async () => {
              await startRecordingFlowRef.current();
              // 启动期间用户已经松手，立即停止
              if (!isHoldPressedRef.current && statusRef.current === "recording") {
                await stopRecordingFlowRef.current();
              }
            })();
          } else if (event.state === "Released") {
            if (!isHoldPressedRef.current) return;
            isHoldPressedRef.current = false;
            if (statusRef.current === "recording") {
              void stopRecordingFlowRef.current();
            }
          }
        });
      } catch (error) {
        setMessage(
          `注册快捷键「${accelerator}」失败：${toErrorMessage(error, "请检查是否被其他应用占用")}`,
        );
      }
    })();

    return () => {
      cancelled = true;
      isHoldPressedRef.current = false;
      unregisterShortcut(accelerator).catch(() => {
        // 忽略反注册失败：通常是窗口正在关闭
      });
    };
  }, [settings.hotkey, settings.hotkeyMode]);

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

  async function startRecordingFlow() {
    try {
      setRecognizedText("");
      setFinalText("");
      partialTranscriptRef.current = "";
      setMessage("正在录音。");

      if (settings.stt.provider === "dashscope") {
        await startDashscopeRecording();
      }

      recordingStartedAtRef.current = Date.now();
      setStatus("recording");
    } catch (error) {
      setStatus("failed");
      setMessage(toErrorMessage(error, "无法开始录音。"));
      await cleanupAsr();
    }
  }

  async function stopRecordingFlow() {
    const durationMs = Date.now() - recordingStartedAtRef.current;
    if (isRecordingTooShort(durationMs)) {
      setStatus("idle");
      setMessage(`录音时长不足 ${MIN_RECORDING_DURATION_MS} 毫秒，已忽略。`);
      await cleanupAsr();
      return;
    }

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
  }

  async function handleRecordClick() {
    if (status === "recording") {
      await stopRecordingFlow();
    } else {
      await startRecordingFlow();
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

  async function handleClearHistory() {
    if (history.length === 0) return;
    const confirmed = window.confirm(
      `确认清空所有历史记录吗？共 ${history.length} 条，此操作不可撤销。`,
    );
    if (!confirmed) return;
    await persistHistory([]);
    setMessage("历史记录已清空。");
  }

  async function setWindowModeTo(target: WindowMode) {
    try {
      await applyWindowMode(target, {
        alwaysOnTop: settings.compactAlwaysOnTop,
      });
      setWindowMode(target);
      if (target !== "full") {
        setSettingsOpen(false);
      }
    } catch (error) {
      setMessage(toErrorMessage(error, "切换窗口模式失败。"));
    }
  }

  async function toggleWindowMode() {
    await setWindowModeTo(windowMode === "full" ? "compact" : "full");
  }

  async function handleSaveSettings() {
    const normalized = normalizeSettings({ ...settings, defaultTemplateId: selectedTemplateId });
    setSettings(normalized);
    setSelectedTemplateId(normalized.defaultTemplateId);
    await saveSettings(normalized);
    setMessage("设置已保存。");
    setSettingsOpen(false);
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

    let nextSettings: AppSettings;
    let activeId: string;

    if (editingTemplateId) {
      nextSettings = normalizeSettings({
        ...settings,
        customTemplates: updateCustomTemplate(settings.customTemplates, editingTemplateId, {
          name: customTemplateName,
          userPromptTemplate: customTemplatePrompt,
        }),
      });
      activeId = editingTemplateId;
      setMessage("自定义模板已更新。");
    } else {
      const template = createCustomTemplate({
        name: customTemplateName,
        description: "用户自定义润色模板",
        userPromptTemplate: customTemplatePrompt,
      });
      nextSettings = normalizeSettings({
        ...settings,
        customTemplates: [...settings.customTemplates, template],
        defaultTemplateId: template.id,
      });
      activeId = template.id;
      setMessage("自定义模板已保存。");
    }

    setSettings(nextSettings);
    setSelectedTemplateId(activeId);
    setEditingTemplateId(null);
    setCustomTemplateName("");
    setCustomTemplatePrompt("请改写以下内容：\n{{input}}");
    await saveSettings(nextSettings);
  }

  function handleEditCustomTemplate(template: PromptTemplate) {
    setEditingTemplateId(template.id);
    setCustomTemplateName(template.name);
    setCustomTemplatePrompt(template.userPromptTemplate);
    setMessage(`正在编辑「${template.name}」。`);
  }

  async function handleDeleteCustomTemplate(template: PromptTemplate) {
    const remaining = removeCustomTemplate(settings.customTemplates, template.id);
    const nextDefaultId =
      settings.defaultTemplateId === template.id ? "clean" : settings.defaultTemplateId;
    const nextSettings = normalizeSettings({
      ...settings,
      customTemplates: remaining,
      defaultTemplateId: nextDefaultId,
    });
    setSettings(nextSettings);
    if (selectedTemplateId === template.id) {
      setSelectedTemplateId(nextDefaultId);
    }
    if (editingTemplateId === template.id) {
      setEditingTemplateId(null);
      setCustomTemplateName("");
      setCustomTemplatePrompt("请改写以下内容：\n{{input}}");
    }
    await saveSettings(nextSettings);
    setMessage(`已删除「${template.name}」。`);
  }

  function handleApplyExample(example: (typeof EXAMPLE_TEMPLATES)[number]) {
    setEditingTemplateId(null);
    setCustomTemplateName(example.name);
    setCustomTemplatePrompt(example.userPromptTemplate);
    setMessage(`已填入「${example.name}」示例，可继续编辑后保存。`);
  }

  function handleCancelEdit() {
    setEditingTemplateId(null);
    setCustomTemplateName("");
    setCustomTemplatePrompt("请改写以下内容：\n{{input}}");
  }

  if (windowMode === "spirit") {
    const compactLabel = status === "recording" ? "结束录音" : "开始录音";
    return (
      <div className={`spirit-shell status-shell-${status}`} data-tauri-drag-region>
        <div className="spirit-dragbar" data-tauri-drag-region>
          <button
            type="button"
            className="compact-action"
            onClick={() => setWindowModeTo("compact")}
            aria-label="切回小窗口"
            title="切回小窗口"
          >
            <Minimize2 size={12} />
          </button>
          <button
            type="button"
            className="compact-action"
            onClick={() => setWindowModeTo("full")}
            aria-label="展开主窗口"
            title="展开主窗口"
          >
            <Maximize2 size={14} />
          </button>
        </div>
        <button
          type="button"
          className={`spirit-figure status-${status}`}
          onClick={handleRecordClick}
          aria-pressed={status === "recording"}
          aria-label={compactLabel}
          title={compactLabel}
        >
          <span className="spirit-wave" />
          <span className="spirit-wave" />
          <span className="spirit-wave" />
          <svg
            viewBox="0 0 100 100"
            className="spirit-svg"
            aria-hidden="true"
          >
            <path className="spirit-ear spirit-ear-left" d="M 22 30 L 14 6 L 40 22 Z" />
            <path className="spirit-ear spirit-ear-right" d="M 78 30 L 86 6 L 60 22 Z" />
            <circle className="spirit-body" cx="50" cy="58" r="30" />
            <ellipse className="spirit-eye spirit-eye-left" cx="40" cy="54" rx="3.6" ry="3.6" />
            <ellipse className="spirit-eye spirit-eye-right" cx="60" cy="54" rx="3.6" ry="3.6" />
            <path
              className="spirit-mouth"
              d="M 44 68 Q 50 72 56 68"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <p className="spirit-status" title={message} data-tauri-drag-region>
          {STATUS_LABELS[status]}
        </p>
      </div>
    );
  }

  if (windowMode === "compact") {
    const compactLabel = status === "recording" ? "结束录音" : "开始录音";
    return (
      <div className={`compact-shell status-shell-${status}`} data-tauri-drag-region>
        <div className="compact-dragbar" data-tauri-drag-region>
          <button
            type="button"
            className="compact-action"
            onClick={() => setWindowModeTo("spirit")}
            aria-label="切换为精灵"
            title="切换为精灵"
          >
            <Sparkles size={14} />
          </button>
          <button
            type="button"
            className="compact-action"
            onClick={toggleWindowMode}
            aria-label="展开主窗口"
            title="展开主窗口"
          >
            <Maximize2 size={14} />
          </button>
        </div>
        <button
          type="button"
          className={`compact-record status-${status}`}
          onClick={handleRecordClick}
          aria-pressed={status === "recording"}
          aria-label={compactLabel}
          title={compactLabel}
        >
          {status === "recording" ? <Square size={28} /> : <Mic size={28} />}
        </button>
        <p className="compact-status" title={message} data-tauri-drag-region>
          <span className="compact-status-label" data-tauri-drag-region>
            {STATUS_LABELS[status]}
          </span>
          <span className="compact-status-sep" data-tauri-drag-region>·</span>
          <span className="compact-status-message" data-tauri-drag-region>
            {message}
          </span>
        </p>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Voice Input Assistant</p>
          <h1>语音输入助手</h1>
        </div>
        <div className="topbar-actions">
          <div className={`status-pill status-${status}`}>{STATUS_LABELS[status]}</div>
          <button
            type="button"
            className="icon-button"
            onClick={toggleWindowMode}
            aria-label="切换为小窗口"
            title="切换为小窗口"
          >
            <Minimize2 size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="打开设置"
          >
            <SettingsIcon size={18} />
            设置
          </button>
        </div>
      </header>

      <section className="workspace">
        <section className="panel input-panel" aria-label="录音输入">
          <div className="record-block">
            <button
              className={`record-button status-${status}`}
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
          <section className="panel history-panel" aria-label="最近历史">
            <div className="section-title">
              <h2>最近历史</h2>
              {history.length > 0 ? (
                <button
                  type="button"
                  className="history-clear"
                  onClick={handleClearHistory}
                  aria-label="清空历史记录"
                >
                  <Trash2 size={14} />
                  清空
                </button>
              ) : null}
            </div>
            {history.length === 0 ? (
              <p className="empty">暂无历史记录，开始你的第一段录音吧。</p>
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

      {settingsOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="设置"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSettingsOpen(false);
            }
          }}
        >
          <div className="modal-card">
            <header className="modal-header">
              <div>
                <p className="modal-eyebrow">偏好与连接</p>
                <h2>设置</h2>
              </div>
              <button
                type="button"
                className="icon-button modal-close"
                onClick={() => setSettingsOpen(false)}
                aria-label="关闭设置"
              >
                <X size={18} />
              </button>
            </header>

            <div className="modal-body">
              <section className="form-group">
                <header className="form-group-header">
                  <h3>语音识别</h3>
                  <p>选择 ASR 服务并填入凭据，DashScope 走百炼 Qwen-ASR-Realtime。</p>
                </header>
                <div className="form-grid">
                  <label>
                    <span>STT Provider</span>
                    <select
                      value={settings.stt.provider}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          stt: {
                            ...current.stt,
                            provider:
                              event.target.value === "dashscope" ? "dashscope" : "mock",
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
                </div>
              </section>

              <section className="form-group">
                <header className="form-group-header">
                  <h3>AI 润色</h3>
                  <p>OpenAI 兼容接口，留空则跳过润色，直接输出识别原文。</p>
                </header>
                <div className="form-grid">
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
                </div>
              </section>

              <section className="form-group">
                <header className="form-group-header">
                  <h3>界面行为</h3>
                  <p>控制小窗口的显示方式，下次切换到小窗口时生效。</p>
                </header>
                <label className="form-toggle">
                  <input
                    type="checkbox"
                    checked={settings.compactAlwaysOnTop}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        compactAlwaysOnTop: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>小窗口常驻最上层</strong>
                    <em>开启后小窗口始终浮在其他窗口之上，方便边录边切应用</em>
                  </span>
                </label>
                <label>
                  <span>
                    全局快捷键
                    <em className="field-hint">
                      在任何应用下按一下开始/停止录音。格式如 <code>Ctrl+Alt+Space</code>、<code>Ctrl+Shift+R</code>，保存后立即生效。
                    </em>
                  </span>
                  <input
                    value={settings.hotkey}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, hotkey: event.target.value }))
                    }
                    placeholder="Ctrl+Alt+Space"
                  />
                </label>
                <label>
                  <span>
                    快捷键模式
                    <em className="field-hint">
                      <strong>切换</strong>：按一下开始，再按一下停。
                      <strong>按住</strong>：按下开始、松开停止，类似对讲机/微信语音。
                    </em>
                  </span>
                  <select
                    value={settings.hotkeyMode}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        hotkeyMode: event.target.value === "hold" ? "hold" : "toggle",
                      }))
                    }
                  >
                    <option value="toggle">切换（按一下切换）</option>
                    <option value="hold">按住（对讲）</option>
                  </select>
                </label>
              </section>

              <section className="form-group">
                <header className="form-group-header">
                  <h3>自定义模板</h3>
                  <p>把"风格指南"放前面，{`{{input}}`} 放末尾。规则越具体，结果越稳定。</p>
                </header>

                {settings.customTemplates.length > 0 ? (
                  <ul className="template-list">
                    {settings.customTemplates.map((template) => (
                      <li
                        key={template.id}
                        className={`template-row${editingTemplateId === template.id ? " editing" : ""}`}
                      >
                        <div className="template-row-main">
                          <strong>{template.name}</strong>
                          {template.description ? <p>{template.description}</p> : null}
                        </div>
                        <div className="template-row-actions">
                          <button
                            type="button"
                            className="row-button"
                            onClick={() => handleEditCustomTemplate(template)}
                            aria-label={`编辑 ${template.name}`}
                          >
                            <Pencil size={14} />
                            编辑
                          </button>
                          <button
                            type="button"
                            className="row-button row-button-danger"
                            onClick={() => handleDeleteCustomTemplate(template)}
                            aria-label={`删除 ${template.name}`}
                          >
                            <Trash2 size={14} />
                            删除
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">还没有自定义模板，可以从下方示例开始。</p>
                )}

                <div className="example-chips" role="group" aria-label="模板示例">
                  <span className="example-chips-label">示例：</span>
                  {EXAMPLE_TEMPLATES.map((example) => (
                    <button
                      key={example.key}
                      type="button"
                      className="chip"
                      onClick={() => handleApplyExample(example)}
                      title={example.description}
                    >
                      {example.name}
                    </button>
                  ))}
                </div>

                <div className="prompt-tips" aria-label="模板撰写指南">
                  <strong>怎么写一个好的提示词</strong>
                  <ol>
                    <li>先用一句说清"要做什么"，例如"请把下面内容改写为正式邮件"。</li>
                    <li>列 2-5 条具体规则（语气、长度、要不要表情/标签等）。</li>
                    <li>结尾放 <code>{`{{input}}`}</code>，并放在"原文："这种小标题下面。</li>
                    <li>不要在 <code>{`{{input}}`}</code> 后面追加指令，会被当成用户原文一部分。</li>
                  </ol>
                </div>

                <div className="form-grid">
                  <label>
                    <span>模板名称</span>
                    <input
                      value={customTemplateName}
                      onChange={(event) => setCustomTemplateName(event.target.value)}
                      placeholder="例如：小红书笔记"
                    />
                  </label>
                </div>

                <label>
                  <span>提示词内容（必须包含 {`{{input}}`}）</span>
                  <textarea
                    value={customTemplatePrompt}
                    onChange={(event) => setCustomTemplatePrompt(event.target.value)}
                    rows={8}
                  />
                </label>

                <div className="prompt-preview" aria-live="polite">
                  <div className="prompt-preview-head">
                    <strong>预览：LLM 实际会看到</strong>
                    <span>示例输入「{PROMPT_PREVIEW_SAMPLE}」</span>
                  </div>
                  <pre>{previewPrompt || "提示词必须包含 {{input}} 占位符，预览暂不可用。"}</pre>
                </div>

                <div className="button-row template-actions">
                  {editingTemplateId ? (
                    <button type="button" className="ghost-button" onClick={handleCancelEdit}>
                      取消编辑
                    </button>
                  ) : null}
                  <button type="button" className="primary-button" onClick={handleAddCustomTemplate}>
                    <Plus size={16} />
                    {editingTemplateId ? "更新模板" : "添加模板"}
                  </button>
                </div>
              </section>
            </div>

            <footer className="modal-footer">
              <button type="button" className="ghost-button" onClick={() => setSettingsOpen(false)}>
                取消
              </button>
              <button type="button" className="primary-button" onClick={handleSaveSettings}>
                <Save size={16} />
                保存设置
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
