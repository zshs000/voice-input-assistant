import { Maximize2, Minimize2 } from "lucide-react";
import type { WindowMode } from "../services/window";
import { STATUS_LABELS, type AppStatus } from "./appUi";

type SpiritWindowProps = {
  status: AppStatus;
  message: string;
  onRecordClick: () => void;
  onSetWindowMode: (target: WindowMode) => void;
};

export function SpiritWindow({
  status,
  message,
  onRecordClick,
  onSetWindowMode,
}: SpiritWindowProps) {
  const compactLabel = status === "recording" ? "结束录音" : "开始录音";

  return (
    <div className={`spirit-shell status-shell-${status}`} data-tauri-drag-region>
      <div className="spirit-dragbar" data-tauri-drag-region>
        <button
          type="button"
          className="compact-action"
          onClick={() => onSetWindowMode("compact")}
          aria-label="切回小窗口"
          title="切回小窗口"
        >
          <Minimize2 size={12} />
        </button>
        <button
          type="button"
          className="compact-action"
          onClick={() => onSetWindowMode("full")}
          aria-label="展开主窗口"
          title="展开主窗口"
        >
          <Maximize2 size={14} />
        </button>
      </div>
      <button
        type="button"
        className={`spirit-figure status-${status}`}
        onClick={onRecordClick}
        aria-pressed={status === "recording"}
        aria-label={compactLabel}
        title={compactLabel}
      >
        <span className="spirit-wave" />
        <span className="spirit-wave" />
        <span className="spirit-wave" />
        <svg viewBox="0 0 100 100" className="spirit-svg" aria-hidden="true">
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
