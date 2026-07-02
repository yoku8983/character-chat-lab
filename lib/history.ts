import { ChatMessage } from "./types";

export const DEFAULT_MAX_HISTORY_MESSAGES = 30;

/**
 * 会話履歴を直近 maxMessages 件に丸める。system/few-shot はここでは扱わない
 * （呼び出し側で固定プレフィックスとして別途保持する前提）。
 * カット後の履歴は user 発話から始まるように調整し、ペア境界を保つ。
 */
export function capMessageHistory(messages: ChatMessage[], maxMessages: number): ChatMessage[] {
  // maxMessages が正の有限数でない、または既に上限以下ならそのまま返す
  if (!Number.isFinite(maxMessages) || maxMessages <= 0) return messages;
  if (messages.length <= maxMessages) return messages;

  let sliced = messages.slice(messages.length - maxMessages);
  // 先頭が assistant なら 1 件落として user 始まりにする（ターン境界を保つ）
  if (sliced.length > 0 && sliced[0].role === "assistant") {
    sliced = sliced.slice(1);
  }
  return sliced;
}
