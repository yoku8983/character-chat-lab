import { QuizItem } from "./dataset";

export interface QuizGrade {
  correct: boolean;
  failedMust: string[]; // 充足できなかった mustContain の要素（元の "|" 区切り表記のまま）
  hitForbidden: string[]; // ヒットしてしまった mustNotContain のキーワード
}

/**
 * 正規化: 空白（全角スペース含む）を除去し、小文字化する。
 * カタカナ/ひらがな変換等の過剰な正規化はしない。
 */
function normalize(text: string): string {
  return text.replace(/[\s　]/g, "").toLowerCase();
}

/**
 * 知識クイズ1問分の応答を採点する純粋関数。
 *
 * - mustContain: 各要素は "|" 区切りで表記ゆれの候補（OR）。1要素につき候補のいずれかが
 *   応答に含まれれば充足。全要素が充足して初めて must 側 OK
 * - mustNotContain: いずれか1つでも応答に含まれたら不正解（ハルシネーション検出）
 * - correct = must 側 OK かつ mustNotContain ヒットなし
 */
export function gradeQuizAnswer(item: QuizItem, answer: string): QuizGrade {
  const normalizedAnswer = normalize(answer);

  const failedMust = item.mustContain.filter((entry) => {
    const candidates = entry.split("|").map((c) => normalize(c));
    return !candidates.some((c) => c.length > 0 && normalizedAnswer.includes(c));
  });

  const hitForbidden = (item.mustNotContain ?? []).filter((keyword) => {
    const normalizedKeyword = normalize(keyword);
    return normalizedKeyword.length > 0 && normalizedAnswer.includes(normalizedKeyword);
  });

  const correct = failedMust.length === 0 && hitForbidden.length === 0;

  return { correct, failedMust, hitForbidden };
}
