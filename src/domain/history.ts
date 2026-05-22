export type HistoryStatus = "completed" | "failed";

export type HistoryItem = {
  id: string;
  recognizedText: string;
  finalText: string;
  templateId: string;
  status: HistoryStatus;
  createdAt: string;
};

export type CreateHistoryItemInput = Omit<HistoryItem, "id">;

const DEFAULT_HISTORY_LIMIT = 20;

export function createHistoryItem(input: CreateHistoryItemInput): HistoryItem {
  return {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    recognizedText: input.recognizedText,
    finalText: input.finalText,
    templateId: input.templateId,
    status: input.status,
    createdAt: input.createdAt,
  };
}

export function addHistoryItem(
  current: HistoryItem[],
  item: HistoryItem,
  limit = DEFAULT_HISTORY_LIMIT,
): HistoryItem[] {
  return [item, ...current].slice(0, Math.max(0, limit));
}
