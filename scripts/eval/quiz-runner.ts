import fs from "fs";
import path from "path";
import { QuizItem } from "./dataset";
import { chatCompletion } from "./openrouter";
import { gradeQuizAnswer, QuizGrade } from "./quiz-grader";
import { sanitizeForFilename, REPORTS_DIR } from "./report";
import { Persona } from "../../lib/types";

export interface QuizItemResult {
  question: string;
  answer: string;
  grade: QuizGrade;
  notes?: string;
}

export interface QuizReport {
  meta: {
    persona: string;
    model: string;
    temperature: number | null;
    dataset: string;
    createdAt: string;
    totalCostUsd: number | null;
  };
  items: QuizItemResult[];
  aggregate: {
    correctCount: number;
    totalCount: number;
    accuracy: number;
  };
}

export interface QuizRunConfig {
  apiKey: string;
  persona: Persona; // 読込済み
  systemPrompt: string; // buildSystemPrompt 済み
  fewShot: { role: string; content: string }[];
  quiz: QuizItem[];
  model: string;
  temperature: number | null;
  onProgress?: (p: { itemIndex: number; itemCount: number }) => void; // 進捗コールバック（GUI 等での表示用。CLI からは未使用）
  shouldCancel?: () => boolean; // true を返すと設問境界で中断する（CLI からは未使用）
}

export interface QuizRunResult {
  items: QuizItemResult[];
  totalCostUsd: number | null;
  cancelled: boolean; // shouldCancel により設問境界で停止した場合 true
}

/**
 * 単一構成（persona × model）で知識クイズを実行し、採点結果を返す純粋関数。
 * コンソール出力・レポート書き出しは行わない（呼び出し側の責務）。
 */
export async function runQuiz(cfg: QuizRunConfig): Promise<QuizRunResult> {
  const items: QuizItemResult[] = [];
  let totalCost: number | null = null;
  let cancelled = false;
  const itemCount = cfg.quiz.length;

  for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
    if (cfg.shouldCancel?.()) {
      cancelled = true;
      break;
    }

    cfg.onProgress?.({ itemIndex, itemCount });

    const item = cfg.quiz[itemIndex];
    const apiMessages = [
      { role: "system", content: cfg.systemPrompt },
      ...cfg.fewShot,
      { role: "user", content: item.question },
    ];

    const result = await chatCompletion({
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages: apiMessages,
      ...(cfg.temperature !== null ? { temperature: cfg.temperature } : {}),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usage: any = result.usage;
    if (usage && typeof usage.cost === "number") {
      totalCost = (totalCost ?? 0) + usage.cost;
    }

    const grade = gradeQuizAnswer(item, result.text);
    items.push({ question: item.question, answer: result.text, grade, notes: item.notes });
  }

  return { items, totalCostUsd: totalCost, cancelled };
}

export function writeQuizReport(report: QuizReport): string {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const createdAtSafe = sanitizeForFilename(report.meta.createdAt);
  const personaSafe = sanitizeForFilename(report.meta.persona);
  const modelSafe = sanitizeForFilename(report.meta.model);

  const filename = `quiz-${createdAtSafe}-${personaSafe}-${modelSafe}.json`;
  const filePath = path.join(REPORTS_DIR, filename);

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filePath;
}
