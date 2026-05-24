import type { OutputMode } from "../domain/settings";
import type { EXAMPLE_TEMPLATES } from "../domain/templates";

export type AppStatus = "idle" | "recording" | "recognizing" | "polishing" | "completed" | "failed";

export type ExampleTemplate = (typeof EXAMPLE_TEMPLATES)[number];

export const STATUS_LABELS: Record<AppStatus, string> = {
  idle: "待机中",
  recording: "录音中",
  recognizing: "识别中",
  polishing: "润色中",
  completed: "已完成",
  failed: "失败",
};

export const OUTPUT_MODE_LABELS: Record<OutputMode, string> = {
  copy: "仅复制",
  insert: "自动插入",
  "copy-and-insert": "复制并插入",
};
