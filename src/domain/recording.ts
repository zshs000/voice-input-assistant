export const MIN_RECORDING_DURATION_MS = 200;

/**
 * 录音时长是否短于阈值，用来过滤误触/手抖产生的极短录音。
 * 命中阈值（默认 200ms）以下视为太短，调用方应跳过识别流程。
 */
export function isRecordingTooShort(
  durationMs: number,
  threshold: number = MIN_RECORDING_DURATION_MS,
): boolean {
  return durationMs < threshold;
}
