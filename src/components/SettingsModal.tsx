import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AppSettings } from "../domain/settings";
import { EXAMPLE_TEMPLATES, PROMPT_PREVIEW_SAMPLE, type PromptTemplate } from "../domain/templates";
import type { ExampleTemplate } from "./appUi";

type SettingsModalProps = {
  settings: AppSettings;
  customTemplateName: string;
  customTemplatePrompt: string;
  editingTemplateId: string | null;
  previewPrompt: string;
  onClose: () => void;
  onSaveSettings: () => void;
  onAddCustomTemplate: () => void;
  onEditCustomTemplate: (template: PromptTemplate) => void;
  onDeleteCustomTemplate: (template: PromptTemplate) => void;
  onApplyExample: (example: ExampleTemplate) => void;
  onCancelEdit: () => void;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  setCustomTemplateName: Dispatch<SetStateAction<string>>;
  setCustomTemplatePrompt: Dispatch<SetStateAction<string>>;
};

export function SettingsModal({
  settings,
  customTemplateName,
  customTemplatePrompt,
  editingTemplateId,
  previewPrompt,
  onClose,
  onSaveSettings,
  onAddCustomTemplate,
  onEditCustomTemplate,
  onDeleteCustomTemplate,
  onApplyExample,
  onCancelEdit,
  setSettings,
  setCustomTemplateName,
  setCustomTemplatePrompt,
}: SettingsModalProps) {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
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
            onClick={onClose}
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
                  在任何应用下按一下开始/停止录音。格式如 <code>Ctrl+Alt+Space</code>、
                  <code>Ctrl+Shift+R</code>，保存后立即生效。
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
                        onClick={() => onEditCustomTemplate(template)}
                        aria-label={`编辑 ${template.name}`}
                      >
                        <Pencil size={14} />
                        编辑
                      </button>
                      <button
                        type="button"
                        className="row-button row-button-danger"
                        onClick={() => onDeleteCustomTemplate(template)}
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
                  onClick={() => onApplyExample(example)}
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
                <button type="button" className="ghost-button" onClick={onCancelEdit}>
                  取消编辑
                </button>
              ) : null}
              <button type="button" className="primary-button" onClick={onAddCustomTemplate}>
                <Plus size={16} />
                {editingTemplateId ? "更新模板" : "添加模板"}
              </button>
            </div>
          </section>
        </div>

        <footer className="modal-footer">
          <button type="button" className="ghost-button" onClick={onClose}>
            取消
          </button>
          <button type="button" className="primary-button" onClick={onSaveSettings}>
            <Save size={16} />
            保存设置
          </button>
        </footer>
      </div>
    </div>
  );
}
