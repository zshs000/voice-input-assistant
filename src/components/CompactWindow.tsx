import { Maximize2, Mic, Sparkles, Square } from "lucide-react";
import type { WindowMode } from "../services/window";
import { STATUS_LABELS, type AppStatus } from "./appUi";

type CompactWindowProps = {
  status: AppStatus;
  message: string;
  onRecordClick: () => void;
  onSetWindowMode: (target: WindowMode) => void;
  onToggleWindowMode: () => void;
};

export function CompactWindow({
  status,
  message,
  onRecordClick,
  onSetWindowMode,
  onToggleWindowMode,
}: CompactWindowProps) {
  const compactLabel = status === "recording" ? "结束录音" : "开始录音";

  return (
    <div className={`compact-shell status-shell-${status}`} data-tauri-drag-region>
      <div className="compact-dragbar" data-tauri-drag-region>
        <button
          type="button"
          className="compact-action"
          onClick={() => onSetWindowMode("spirit")}
          aria-label="切换为精灵"
          title="切换为精灵"
        >
          <Sparkles size={14} />
        </button>
        <button
          type="button"
          className="compact-action"
          onClick={onToggleWindowMode}
          aria-label="展开主窗口"
          title="展开主窗口"
        >
          <Maximize2 size={14} />
        </button>
      </div>
      <button
        type="button"
        className={`compact-record status-${status}`}
        onClick={onRecordClick}
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
        <span className="compact-status-sep" data-tauri-drag-region>
          ·
        </span>
        <span className="compact-status-message" data-tauri-drag-region>
          {message}
        </span>
      </p>
    </div>
  );
}
