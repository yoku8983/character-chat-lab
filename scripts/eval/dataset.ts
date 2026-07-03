import fs from "fs";

export interface ReferencePair {
  situation: string; // 状況・ユーザー発話
  reference: string; // 原作準拠の模範応答
  canon: boolean; // true=原作の名場面由来 / false=原作にない状況（過適合防止用）
  notes?: string;
}

export interface QuizItem {
  question: string; // ペルソナに投げる設問（ユーザー発話として送る）
  mustContain: string[]; // 正答条件: 全要素が応答に含まれること（AND）。各要素は "東京|とうきょう" のように | 区切りで表記ゆれを許容（OR）
  mustNotContain?: string[]; // ハルシネーション検出: いずれかが含まれたら不正解（誤った固有名詞・捏造されがちな事実等）
  notes?: string;
}

export interface EvalDataset {
  personaId: string;
  referencePairs: ReferencePair[];
  knowledgeQuiz?: QuizItem[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function assertReferencePair(value: unknown, index: number): asserts value is ReferencePair {
  if (typeof value !== "object" || value === null) {
    throw new Error(`データセットの referencePairs[${index}] がオブジェクトではありません`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pair = value as any;

  if (!isNonEmptyString(pair.situation)) {
    throw new Error(`データセットの referencePairs[${index}].situation が不正です（空でない文字列が必要）`);
  }
  if (!isNonEmptyString(pair.reference)) {
    throw new Error(`データセットの referencePairs[${index}].reference が不正です（空でない文字列が必要）`);
  }
  if (typeof pair.canon !== "boolean") {
    throw new Error(`データセットの referencePairs[${index}].canon が不正です（真偽値が必要）`);
  }
  if (pair.notes !== undefined && typeof pair.notes !== "string") {
    throw new Error(`データセットの referencePairs[${index}].notes が不正です（文字列が必要）`);
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function assertQuizItem(value: unknown, index: number): asserts value is QuizItem {
  if (typeof value !== "object" || value === null) {
    throw new Error(`データセットの knowledgeQuiz[${index}] がオブジェクトではありません`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = value as any;

  if (!isNonEmptyString(item.question)) {
    throw new Error(`データセットの knowledgeQuiz[${index}].question が不正です（空でない文字列が必要）`);
  }

  if (!isStringArray(item.mustContain)) {
    throw new Error(`データセットの knowledgeQuiz[${index}].mustContain が不正です（文字列配列が必要）`);
  }

  if (item.mustNotContain !== undefined && !isStringArray(item.mustNotContain)) {
    throw new Error(`データセットの knowledgeQuiz[${index}].mustNotContain が不正です（文字列配列が必要）`);
  }

  const hasMustContain = item.mustContain.length > 0;
  const hasMustNotContain = Array.isArray(item.mustNotContain) && item.mustNotContain.length > 0;
  if (!hasMustContain && !hasMustNotContain) {
    throw new Error(
      `データセットの knowledgeQuiz[${index}] は mustContain と mustNotContain の両方が空です。` +
        `「知らないと答えるべき設問」は mustContain を空配列にしつつ mustNotContain を1件以上指定してください`
    );
  }

  if (item.notes !== undefined && typeof item.notes !== "string") {
    throw new Error(`データセットの knowledgeQuiz[${index}].notes が不正です（文字列が必要）`);
  }
}

/**
 * 参照付き Judge 用の正解データセット（原作準拠の模範応答集）と、任意の知識クイズ
 * （ハルシネーション検出用）を JSON から読み込む。
 * 必須フィールドの欠落・型不正・referencePairs が空配列の場合は日本語エラーで throw する。
 * knowledgeQuiz を指定した場合は各要素も検証する（mustContain / mustNotContain が両方空はエラー）。
 * それ以外の未知のフィールドは無視する。
 */
export function loadDataset(filePath: string): EvalDataset {
  if (!fs.existsSync(filePath)) {
    throw new Error(`データセットファイルが見つかりません: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`データセットファイルが JSON として不正です（${filePath}）: ${message}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`データセットのトップレベルがオブジェクトではありません（${filePath}）`);
  }

  if (!isNonEmptyString(parsed.personaId)) {
    throw new Error(`データセットの personaId が不正です（空でない文字列が必要。${filePath}）`);
  }

  if (!Array.isArray(parsed.referencePairs) || parsed.referencePairs.length === 0) {
    throw new Error(
      `データセットの referencePairs が空です。少なくとも1件の参照ペアが必要です（${filePath}）`
    );
  }

  parsed.referencePairs.forEach((pair: unknown, index: number) => assertReferencePair(pair, index));

  if (parsed.knowledgeQuiz !== undefined) {
    if (!Array.isArray(parsed.knowledgeQuiz)) {
      throw new Error(`データセットの knowledgeQuiz が不正です（配列が必要。${filePath}）`);
    }
    parsed.knowledgeQuiz.forEach((item: unknown, index: number) => assertQuizItem(item, index));
  }

  return {
    personaId: parsed.personaId,
    referencePairs: parsed.referencePairs as ReferencePair[],
    ...(parsed.knowledgeQuiz !== undefined ? { knowledgeQuiz: parsed.knowledgeQuiz as QuizItem[] } : {}),
  };
}
