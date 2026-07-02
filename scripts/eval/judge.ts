import { Persona } from "../../lib/types";
import { chatCompletion } from "./openrouter";

export interface JudgeScores {
  toneConsistency: number;
  knowledgeUse: number;
  personaMaintenance: number;
  naturalness: number;
  comment: string;
}

const JUDGE_SYSTEM_PROMPT = `あなたは対話キャラクターの品質評価者です。以下のキャラクター定義と会話を読み、4観点を各1〜5の整数で採点し、JSONのみ出力してください。

観点:
- toneConsistency: 口調一貫性（一人称・語尾・口癖などが会話全体を通して保たれているか）
- knowledgeUse: 知識活用度（キャラクター固有の知識を適切に活かせているか）
- personaMaintenance: 人格維持（性格・価値観がぶれずに一貫しているか）
- naturalness: 自然さ（会話として不自然でないか、キャラクターとして違和感がないか）

加えて comment に日本語1〜2文で総評を書いてください。

出力は次の形式のJSONオブジェクトのみとし、それ以外のテキスト（説明・前置き・コードブロック記法）を含めないでください。
{"toneConsistency": <1-5の整数>, "knowledgeUse": <1-5の整数>, "personaMaintenance": <1-5の整数>, "naturalness": <1-5の整数>, "comment": "<日本語の総評>"}`;

function summarizePersona(persona: Persona): string {
  const { identity, knowledge } = persona;
  const style = identity.speaking_style;
  const parts: string[] = [];

  parts.push(`## キャラクター名\n${persona.name}`);
  parts.push(`\n## 性格\n${identity.personality.trim()}`);
  parts.push(`\n## 話し方`);
  parts.push(`- 一人称: ${style.first_person}`);
  parts.push(`- トーン: ${style.tone}`);
  if (style.sentence_endings?.length > 0) {
    parts.push(`- 特徴的な語尾: ${style.sentence_endings.join("、")}`);
  }
  if (style.catchphrases?.length > 0) {
    parts.push(`- 口癖: ${style.catchphrases.join("、")}`);
  }
  if (style.vocabulary_notes) {
    parts.push(`- 語彙の特徴: ${style.vocabulary_notes.trim()}`);
  }

  if (knowledge?.domains?.length > 0) {
    parts.push(`\n## 固有知識トピック`);
    for (const domain of knowledge.domains) {
      parts.push(`- ${domain.topic}`);
    }
  }

  return parts.join("\n");
}

function formatTranscript(transcript: { role: string; content: string }[]): string {
  return transcript
    .map((m) => `${m.role === "user" ? "ユーザー" : roleLabel(m.role)}: ${m.content}`)
    .join("\n\n");
}

function roleLabel(role: string): string {
  return role === "assistant" ? "キャラクター" : role;
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export async function judgeConversation(args: {
  apiKey: string;
  judgeModel: string;
  persona: Persona;
  transcript: { role: string; content: string }[];
}): Promise<JudgeScores> {
  const { apiKey, judgeModel, persona, transcript } = args;

  const userContent = `## キャラクター定義\n${summarizePersona(persona)}\n\n## 会話\n${formatTranscript(
    transcript
  )}`;

  try {
    const result = await chatCompletion({
      apiKey,
      model: judgeModel,
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`JSON が見つかりません: ${result.text.slice(0, 200)}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = JSON.parse(match[0]);

    return {
      toneConsistency: clampScore(parsed.toneConsistency),
      knowledgeUse: clampScore(parsed.knowledgeUse),
      personaMaintenance: clampScore(parsed.personaMaintenance),
      naturalness: clampScore(parsed.naturalness),
      comment: typeof parsed.comment === "string" ? parsed.comment : "",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      toneConsistency: 0,
      knowledgeUse: 0,
      personaMaintenance: 0,
      naturalness: 0,
      comment: `Judge の採点に失敗しました: ${message.slice(0, 300)}`,
    };
  }
}
