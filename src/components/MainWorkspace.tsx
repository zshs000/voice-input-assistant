import {
  Clipboard,
  Keyboard,
  Mic,
  Minimize2,
  RefreshCcw,
  Send,
  Settings as SettingsIcon,
  Square,
  Trash2,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { HistoryItem } from "../domain/history";
import type { AppSettings, OutputMode } from "../domain/settings";
import type { PromptTemplate } from "../domain/templates";
import { OUTPUT_MODE_LABELS, STATUS_LABELS, type AppStatus } from "./appUi";

type MainWorkspaceProps = {
  status: AppStatus;
  message: string;
  settings: AppSettings;
  templates: PromptTemplate[];
  selectedTemplateId: string;
  recognizedText: string;
  finalText: string;
  history: HistoryItem[];
  onRecordClick: () => void;
  onRepolish: () => void;
  onManualCopy: () => void;
  onManualInsert: () => void;
  onClearHistory: () => void;
  onToggleWindowMode: () => void;
  onOpenSettings: () => void;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  setSelectedTemplateId: Dispatch<SetStateAction<string>>;
  setRecognizedText: Dispatch<SetStateAction<string>>;
  setFinalText: Dispatch<SetStateAction<string>>;
};

export function MainWorkspace({
  status,
  message,
  settings,
  templates,
  selectedTemplateId,
  recognizedText,
  finalText,
  history,
  onRecordClick,
  onRepolish,
  onManualCopy,
  onManualInsert,
  onClearHistory,
  onToggleWindowMode,
  onOpenSettings,
  setSettings,
  setSelectedTemplateId,
  setRecognizedText,
  setFinalText,
}: MainWorkspaceProps) {
  return (
    <>
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
            onClick={onToggleWindowMode}
            aria-label="切换为小窗口"
            title="切换为小窗口"
          >
            <Minimize2 size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onOpenSettings}
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
              onClick={onRecordClick}
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
            <button type="button" onClick={onRepolish} disabled={!recognizedText.trim()}>
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
            <button type="button" onClick={onManualCopy} disabled={!recognizedText && !finalText}>
              <Clipboard size={16} />
              复制
            </button>
            <button type="button" onClick={onManualInsert} disabled={!recognizedText && !finalText}>
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
                  onClick={onClearHistory}
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
    </>
  );
}
