import { describe, expect, it } from "vitest";
import { addHistoryItem, createHistoryItem } from "./history";

describe("history", () => {
  it("creates text-only history items", () => {
    const item = createHistoryItem({
      recognizedText: "原始文本",
      finalText: "最终文本",
      templateId: "clean",
      status: "completed",
      createdAt: "2026-05-23T00:00:00.000Z",
    });

    expect(item.id).toMatch(/^hist_/);
    expect(item).not.toHaveProperty("audioPath");
    expect(item.finalText).toBe("最终文本");
  });

  it("prepends new items and trims old records", () => {
    const first = createHistoryItem({
      recognizedText: "一",
      finalText: "一",
      templateId: "original",
      status: "completed",
      createdAt: "2026-05-23T00:00:00.000Z",
    });
    const second = createHistoryItem({
      recognizedText: "二",
      finalText: "二",
      templateId: "clean",
      status: "completed",
      createdAt: "2026-05-23T00:01:00.000Z",
    });

    expect(addHistoryItem([first], second, 1)).toEqual([second]);
  });
});
