import { Persona } from "../../lib/types";
import { chatCompletion } from "./openrouter";
import { ReferencePair } from "./dataset";

export interface JudgeScores {
  toneConsistency: number;
  knowledgeUse: number;
  personaMaintenance: number;
  naturalness: number;
  referenceFidelity?: number;
  comment: string;
  failed?: boolean;
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

const JUDGE_SYSTEM_PROMPT_WITH_REFERENCE = `あなたは対話キャラクターの品質評価者です。以下のキャラクター定義・正解応答例（この人物の本物の応答）・評価対象の会話を読み、5観点を各1〜5の整数で採点し、JSONのみ出力してください。

観点:
- toneConsistency: 口調一貫性（一人称・語尾・口癖などが会話全体を通して保たれているか）
- knowledgeUse: 知識活用度（キャラクター固有の知識を適切に活かせているか）
- personaMaintenance: 人格維持（性格・価値観がぶれずに一貫しているか）
- naturalness: 自然さ（会話として不自然でないか、キャラクターとして違和感がないか）
- referenceFidelity: 参照忠実度（人物同一性）。正解応答例と比較して「同じ人物が書いた応答」と言えるかを、以下の厳格な減点式 rubric で採点してください。安易に高得点を付けないこと。
  - 5 = 正解例と同じ人物が書いたと区別できない（明確な根拠がある場合のみ付けること）
  - 4 = ほぼ同一人物だが、わずかな違和感（語彙選択・呼吸）が1〜2箇所ある
  - 3 = 似せているが、別人と分かる箇所が複数ある
  - 2 = 表面的な模倣（口調記号だけ真似て人格・思考が別人）
  - 1 = 別人

**重要な注意（過適合の防止）**: 正解応答例の文言をそのまま流用しているだけの応答は高評価にしないでください。正解例にない状況（situation が正解例と異なる場面）でも同じ人物らしさが保てているかを重視してください。正解例は「この人物ならどう考え、どう話すか」の参考であり、模範解答の丸暗記ではありません。

加えて comment に日本語1〜2文で総評を書いてください。

出力は次の形式のJSONオブジェクトのみとし、それ以外のテキスト（説明・前置き・コードブロック記法）を含めないでください。
{"toneConsistency": <1-5の整数>, "knowledgeUse": <1-5の整数>, "personaMaintenance": <1-5の整数>, "naturalness": <1-5の整数>, "referenceFidelity": <1-5の整数>, "comment": "<日本語の総評>"}`;

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

function formatReferencePairs(referencePairs: ReferencePair[]): string {
  return referencePairs
    .map((pair, i) => {
      const canonLabel = pair.canon ? "原作の名場面" : "原作にない状況（汎化確認用）";
      return `${i + 1}. [${canonLabel}]\n状況: ${pair.situation}\n応答: ${pair.reference}`;
    })
    .join("\n\n");
}

/**
 * Judge に渡す system プロンプトを選ぶ純粋関数。referencePairs の有無のみで分岐する。
 */
export function selectJudgeSystemPrompt(referencePairs?: ReferencePair[]): string {
  return referencePairs && referencePairs.length > 0
    ? JUDGE_SYSTEM_PROMPT_WITH_REFERENCE
    : JUDGE_SYSTEM_PROMPT;
}

/**
 * Judge に渡す user コンテンツを組み立てる純粋関数（API 呼び出しなしで検証可能）。
 * referencePairs が与えられた場合のみ「## 正解応答例」ブロックを注入する。
 */
export function buildJudgeUserContent(args: {
  persona: Persona;
  transcript: { role: string; content: string }[];
  referencePairs?: ReferencePair[];
}): string {
  const { persona, transcript, referencePairs } = args;

  const parts = [`## キャラクター定義\n${summarizePersona(persona)}`];

  if (referencePairs && referencePairs.length > 0) {
    parts.push(`\n## 正解応答例（この人物の本物の応答）\n${formatReferencePairs(referencePairs)}`);
  }

  parts.push(`\n## 会話\n${formatTranscript(transcript)}`);

  return parts.join("\n");
}

export async function judgeConversation(args: {
  apiKey: string;
  judgeModel: string;
  persona: Persona;
  transcript: { role: string; content: string }[];
  referencePairs?: ReferencePair[];
}): Promise<JudgeScores> {
  const { apiKey, judgeModel, persona, transcript, referencePairs } = args;

  const systemPrompt = selectJudgeSystemPrompt(referencePairs);
  const userContent = buildJudgeUserContent({ persona, transcript, referencePairs });
  const hasReference = Boolean(referencePairs && referencePairs.length > 0);

  try {
    const result = await chatCompletion({
      apiKey,
      model: judgeModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`JSON が見つかりません: ${result.text.slice(0, 200)}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = JSON.parse(match[0]);

    // Judge が referenceFidelity を出力し損ねた場合、clampScore は 0（正常レンジ外）を
    // 返すため、そのまま含めると集計平均を歪める。有効値（1〜5）のときのみ含める
    const referenceFidelity = clampScore(parsed.referenceFidelity);

    return {
      toneConsistency: clampScore(parsed.toneConsistency),
      knowledgeUse: clampScore(parsed.knowledgeUse),
      personaMaintenance: clampScore(parsed.personaMaintenance),
      naturalness: clampScore(parsed.naturalness),
      ...(hasReference && referenceFidelity >= 1 ? { referenceFidelity } : {}),
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
      failed: true,
    };
  }
}
