import { describe, expect, it } from "vitest";
import { isRecordingTooShort, MIN_RECORDING_DURATION_MS } from "./recording";

describe("isRecordingTooShort", () => {
  it("exposes a sensible default threshold", () => {
    expect(MIN_RECORDING_DURATION_MS).toBe(200);
  });

  it("treats durations below the default threshold as too short", () => {
    expect(isRecordingTooShort(0)).toBe(true);
    expect(isRecordingTooShort(100)).toBe(true);
    expect(isRecordingTooShort(MIN_RECORDING_DURATION_MS - 1)).toBe(true);
  });

  it("accepts durations at or above the default threshold", () => {
    expect(isRecordingTooShort(MIN_RECORDING_DURATION_MS)).toBe(false);
    expect(isRecordingTooShort(MIN_RECORDING_DURATION_MS + 1)).toBe(false);
    expect(isRecordingTooShort(1500)).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(isRecordingTooShort(99, 100)).toBe(true);
    expect(isRecordingTooShort(100, 100)).toBe(false);
    expect(isRecordingTooShort(250, 300)).toBe(true);
  });
});
