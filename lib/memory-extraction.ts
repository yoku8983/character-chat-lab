import { ChatMessage } from "./types";

const EXTRACTION_PROMPT = `あなたはAIアシスタントの記憶管理システムです。
以下の会話から、将来の会話で役立つ重要な情報を抽出してください。

抽出すべき情報:
- ユーザーの好み・趣味・興味（例: 「猫が好き」「プログラミングに興味がある」）
- ユーザーの属性・状況（例: 「大学生」「最近転職した」）
- ユーザーとの約束・依頼事項
- 会話で共有された重要な出来事
- ユーザーの感情状態や悩み

抽出すべきでない情報:
- 一般的な挨拶や相槌
- キャラクターの既知の設定情報
- 一時的・文脈限定的な情報

出力形式（JSON配列のみ、他のテキストは不要）:
[
  {"content": "抽出された記憶", "importance": 重要度(1-10の整数)},
  ...
]

記憶が抽出できない場合は空配列 [] を返してください。`;

export interface ExtractedMemory {
  content: string;
  importance: number;
}

export interface ExtractMemoriesResult {
  memories: ExtractedMemory[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usage: any;
}

export async function extractMemories(
  messages: ChatMessage[],
  apiKey: string,
  modelId: string
): Promise<ExtractMemoriesResult> {
  const recentMessages = messages.slice(-20);

  const conversationText = recentMessages
    .map((m) => `${m.role === "user" ? "ユーザー" : "アシスタント"}: ${m.content}`)
    .join("\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: conversationText },
      ],
    }),
  });

  if (!response.ok) return { memories: [], usage: null };

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage ?? null;

  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return { memories: [], usage };
    const parsed = JSON.parse(match[0]) as ExtractedMemory[];
    const memories = parsed
      .filter((m) => m.content && typeof m.importance === "number")
      .map((m) => ({
        content: m.content,
        importance: Math.max(1, Math.min(10, Math.round(m.importance))),
      }));
    return { memories, usage };
  } catch {
    return { memories: [], usage };
  }
}
