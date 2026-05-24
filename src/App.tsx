import { useEffect, useMemo, useRef, useState } from "react";
import { CompactWindow } from "./components/CompactWindow";
import { MainWorkspace } from "./components/MainWorkspace";
import { SettingsModal } from "./components/SettingsModal";
import { SpiritWindow } from "./components/SpiritWindow";
import { type AppStatus, type ExampleTemplate } from "./components/appUi";
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

  function handleApplyExample(example: ExampleTemplate) {
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
    return (
      <SpiritWindow
        status={status}
        message={message}
        onRecordClick={handleRecordClick}
        onSetWindowMode={setWindowModeTo}
      />
    );
  }

  if (windowMode === "compact") {
    return (
      <CompactWindow
        status={status}
        message={message}
        onRecordClick={handleRecordClick}
        onSetWindowMode={setWindowModeTo}
        onToggleWindowMode={toggleWindowMode}
      />
    );
  }

  return (
    <main className="app-shell">
      <MainWorkspace
        status={status}
        message={message}
        settings={settings}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        recognizedText={recognizedText}
        finalText={finalText}
        history={history}
        onRecordClick={handleRecordClick}
        onRepolish={handleRepolish}
        onManualCopy={handleManualCopy}
        onManualInsert={handleManualInsert}
        onClearHistory={handleClearHistory}
        onToggleWindowMode={toggleWindowMode}
        onOpenSettings={() => setSettingsOpen(true)}
        setSettings={setSettings}
        setSelectedTemplateId={setSelectedTemplateId}
        setRecognizedText={setRecognizedText}
        setFinalText={setFinalText}
      />

      {settingsOpen ? (
        <SettingsModal
          settings={settings}
          customTemplateName={customTemplateName}
          customTemplatePrompt={customTemplatePrompt}
          editingTemplateId={editingTemplateId}
          previewPrompt={previewPrompt}
          onClose={() => setSettingsOpen(false)}
          onSaveSettings={handleSaveSettings}
          onAddCustomTemplate={handleAddCustomTemplate}
          onEditCustomTemplate={handleEditCustomTemplate}
          onDeleteCustomTemplate={handleDeleteCustomTemplate}
          onApplyExample={handleApplyExample}
          onCancelEdit={handleCancelEdit}
          setSettings={setSettings}
          setCustomTemplateName={setCustomTemplateName}
          setCustomTemplatePrompt={setCustomTemplatePrompt}
        />
      ) : null}
    </main>
  );
}
