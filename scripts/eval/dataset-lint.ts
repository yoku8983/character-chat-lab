import { loadDataset, type EvalDataset } from "./dataset";

/**
 * 正解データセットの品質 lint CLI。
 *
 * 使い方:
 *   npm run dataset:lint -- <path>
 *
 * 2 段階で検査する:
 *   1. 形式検証: loadDataset による必須フィールド・型チェック。違反は ERROR（exit 1）
 *   2. 品質ルール: 推奨値からの逸脱を WARN として表示するだけ（exit 0 のまま）。
 *      推奨値の根拠は docs/persona-playbook.md を参照
 */

interface LintMessage {
  level: "WARN" | "INFO";
  message: string;
}

// 品質ルールの推奨値（プレイブックと同期させること）
const PAIR_COUNT_MIN = 20; // v1 の最低ライン
const PAIR_COUNT_RECOMMENDED = 50; // 本番回帰評価の推奨下限（CharacterEval 約59件/キャラ、PersonaGym 50問/ペルソナが相場）
const NON_CANON_RATIO_MIN = 0.3; // 参照過適合防止: 原作にない状況を 3〜4 割
const NON_CANON_RATIO_MAX = 0.4;
const SITUATION_MIN_LENGTH = 12; // 感情文脈・状況が書けている最低限の長さの目安
const REFERENCE_MIN_LENGTH = 15; // 模範応答として成立する最低限の長さの目安
const HALLUCINATION_QUIZ_MIN = 2; // 捏造検出型（mustNotContain あり）クイズの最低数

export function lintDataset(dataset: EvalDataset): LintMessage[] {
  const messages: LintMessage[] = [];
  const pairs = dataset.referencePairs;

  // --- ペア数 ---
  if (pairs.length < PAIR_COUNT_MIN) {
    messages.push({
      level: "WARN",
      message: `参照ペアが ${pairs.length} 件です（v1 の最低ライン ${PAIR_COUNT_MIN} 件未満）。評価の安定性が下がります`,
    });
  } else if (pairs.length < PAIR_COUNT_RECOMMENDED) {
    messages.push({
      level: "INFO",
      message: `参照ペアが ${pairs.length} 件です。初期評価には十分ですが、本番回帰評価は ${PAIR_COUNT_RECOMMENDED} 件以上を推奨します`,
    });
  }

  // --- canon:false 比率（参照過適合防止） ---
  const nonCanonCount = pairs.filter((p) => !p.canon).length;
  const nonCanonRatio = nonCanonCount / pairs.length;
  const ratioPercent = Math.round(nonCanonRatio * 100);
  if (nonCanonRatio < NON_CANON_RATIO_MIN) {
    messages.push({
      level: "WARN",
      message:
        `canon:false（原作にない状況）が ${nonCanonCount} 件（${ratioPercent}%）です。` +
        `3〜4 割を推奨します（少なすぎると原作再現への過適合を検出できません）`,
    });
  } else if (nonCanonRatio > NON_CANON_RATIO_MAX) {
    messages.push({
      level: "WARN",
      message:
        `canon:false（原作にない状況）が ${nonCanonCount} 件（${ratioPercent}%）です。` +
        `3〜4 割を推奨します（多すぎると原作準拠の評価が薄まります）`,
    });
  }

  // --- situation / reference の重複 ---
  const seenSituations = new Map<string, number>();
  const seenReferences = new Map<string, number>();
  pairs.forEach((pair, index) => {
    const dupSituation = seenSituations.get(pair.situation);
    if (dupSituation !== undefined) {
      messages.push({
        level: "WARN",
        message: `referencePairs[${index}].situation が referencePairs[${dupSituation}] と重複しています`,
      });
    } else {
      seenSituations.set(pair.situation, index);
    }

    const dupReference = seenReferences.get(pair.reference);
    if (dupReference !== undefined) {
      messages.push({
        level: "WARN",
        message: `referencePairs[${index}].reference が referencePairs[${dupReference}] と重複しています`,
      });
    } else {
      seenReferences.set(pair.reference, index);
    }
  });

  // --- 極端に短い situation / reference ---
  // reference の短さは canon:false のみ検査する。canon:true の原作由来ペアでは
  // 短い名返答が正当に存在する（文脈は situation 側が担う）が、canon:false で
  // ドラフト生成した模範応答が短すぎる場合は状況を受け止めきれていない疑いがある
  pairs.forEach((pair, index) => {
    if (pair.situation.length < SITUATION_MIN_LENGTH) {
      messages.push({
        level: "WARN",
        message:
          `referencePairs[${index}].situation が ${pair.situation.length} 文字と短すぎます` +
          `（${SITUATION_MIN_LENGTH} 文字未満）。誰が・どんな感情文脈で、を書いてください`,
      });
    }
    if (!pair.canon && pair.reference.length < REFERENCE_MIN_LENGTH) {
      messages.push({
        level: "WARN",
        message:
          `referencePairs[${index}].reference（canon:false）が ${pair.reference.length} 文字と短すぎます` +
          `（${REFERENCE_MIN_LENGTH} 文字未満）。模範応答として成立する長さにしてください`,
      });
    }
  });

  // --- 知識クイズ ---
  const quiz = dataset.knowledgeQuiz ?? [];
  if (quiz.length === 0) {
    messages.push({
      level: "INFO",
      message: "knowledgeQuiz がありません。知識のハルシネーション検出には knowledgeQuiz の追加を推奨します",
    });
  } else {
    const hallucinationCount = quiz.filter(
      (item) => Array.isArray(item.mustNotContain) && item.mustNotContain.length > 0
    ).length;
    if (hallucinationCount < HALLUCINATION_QUIZ_MIN) {
      messages.push({
        level: "WARN",
        message:
          `捏造検出型クイズ（mustNotContain あり）が ${hallucinationCount} 問です。` +
          `最低 ${HALLUCINATION_QUIZ_MIN} 問を推奨します（正答型だけでは「知らないことを知らないと言えるか」を測れません）`,
      });
    }

    const seenQuestions = new Map<string, number>();
    quiz.forEach((item, index) => {
      const dup = seenQuestions.get(item.question);
      if (dup !== undefined) {
        messages.push({
          level: "WARN",
          message: `knowledgeQuiz[${index}].question が knowledgeQuiz[${dup}] と重複しています`,
        });
      } else {
        seenQuestions.set(item.question, index);
      }
    });
  }

  return messages;
}

function main(): void {
  const args = process.argv.slice(2);
  const filePath = args.find((arg) => !arg.startsWith("--"));
  if (!filePath) {
    console.error("使い方: npm run dataset:lint -- <データセット JSON のパス>");
    process.exit(1);
  }

  // 1. 形式検証（違反は ERROR で exit 1）
  let dataset: EvalDataset;
  try {
    dataset = loadDataset(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }

  const canonCount = dataset.referencePairs.filter((p) => p.canon).length;
  const nonCanonCount = dataset.referencePairs.length - canonCount;
  console.log(`データセット: ${filePath}`);
  console.log(`personaId: ${dataset.personaId}`);
  console.log(
    `参照ペア: ${dataset.referencePairs.length} 件（canon:true ${canonCount} / canon:false ${nonCanonCount}）` +
      ` / 知識クイズ: ${dataset.knowledgeQuiz?.length ?? 0} 問`
  );
  console.log("形式検証: OK");

  // 2. 品質ルール（警告表示のみ。エラーで止めない）
  const messages = lintDataset(dataset);
  if (messages.length === 0) {
    console.log("品質ルール: 違反なし ✅");
    return;
  }

  console.log(`品質ルール: ${messages.length} 件の指摘`);
  for (const { level, message } of messages) {
    console.log(`  [${level}] ${message}`);
  }
}

// CLI として直接実行された場合のみ main を呼ぶ（テストからの import では呼ばない）
if (process.argv[1] && process.argv[1].endsWith("dataset-lint.ts")) {
  main();
}
