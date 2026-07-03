import fs from "fs";

export interface ReferencePair {
  situation: string; // 状況・ユーザー発話
  reference: string; // 原作準拠の模範応答
  canon: boolean; // true=原作の名場面由来 / false=原作にない状況（過適合防止用）
  notes?: string;
}

export interface EvalDataset {
  personaId: string;
  referencePairs: ReferencePair[];
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

/**
 * 参照付き Judge 用の正解データセット（原作準拠の模範応答集）を JSON から読み込む。
 * 必須フィールドの欠落・型不正・referencePairs が空配列の場合は日本語エラーで throw する。
 * 未知のフィールドは無視する（将来 PR で知識クイズ knowledgeQuiz を同ファイルに足す予定のため）。
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

  return {
    personaId: parsed.personaId,
    referencePairs: parsed.referencePairs as ReferencePair[],
  };
}
