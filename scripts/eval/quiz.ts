import { loadEnv } from "./env";
import { loadPersonaSource } from "./persona-loader";
import { loadDataset, QuizItem } from "./dataset";
import { QuizGrade } from "./quiz-grader";
import { buildSystemPrompt, buildFewShotMessages } from "../../lib/prompt";
import { runQuiz, writeQuizReport, QuizReport, QuizItemResult } from "./quiz-runner";

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

interface CliArgs {
  personaId?: string;
  personaFile?: string;
  datasetPath?: string;
  model: string;
  temperature: number | null;
}

function printUsage(): void {
  console.log(`使い方:
  npm run eval:quiz -- --persona <id> --dataset <path> [options]
  npm run eval:quiz -- --persona-file <path> --dataset <path> [options]

オプション:
  --persona <id>          ペルソナ ID（personas/*.yaml から読み込み）
  --persona-file <path>   ペルソナ定義ファイル（YAML/JSON）のパス
  --dataset <path>        knowledgeQuiz を含む正解データセット（JSON）のパス（必須）
  --model <id>            被評価モデル（既定: ${DEFAULT_MODEL}）
  --temperature <num>     temperature（既定: 未指定）

--persona か --persona-file のどちらかが必須です。`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    model: DEFAULT_MODEL,
    temperature: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--persona":
        args.personaId = next();
        break;
      case "--persona-file":
        args.personaFile = next();
        break;
      case "--dataset":
        args.datasetPath = next();
        break;
      case "--model":
        args.model = next();
        break;
      case "--temperature":
        args.temperature = Number(next());
        break;
      default:
        console.warn(`不明な引数を無視します: ${arg}`);
    }
  }

  return args;
}

function truncate(text: string, length: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length)}…` : normalized;
}

function summarizeGrade(grade: QuizGrade): string {
  const parts: string[] = [];
  if (grade.failedMust.length > 0) {
    parts.push(`未充足: ${grade.failedMust.join(" / ")}`);
  }
  if (grade.hitForbidden.length > 0) {
    parts.push(`禁止語ヒット: ${grade.hitForbidden.join(" / ")}`);
  }
  return parts.join("; ");
}

async function main(): Promise<void> {
  loadEnv();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("エラー: OPENROUTER_API_KEY が設定されていません（.env.local または環境変数で指定してください）");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  if (!args.personaId && !args.personaFile) {
    printUsage();
    process.exit(1);
  }

  if (!args.datasetPath) {
    console.error("エラー: --dataset は必須です（knowledgeQuiz を含むデータセットのパスを指定してください）");
    printUsage();
    process.exit(1);
  }

  const persona = loadPersonaSource({ id: args.personaId, file: args.personaFile });
  const dataset = loadDataset(args.datasetPath);

  if (dataset.personaId !== persona.id) {
    console.warn(
      `警告: データセットの personaId ("${dataset.personaId}") と評価対象ペルソナの id ("${persona.id}") が一致しません。` +
        `本番キャラを --persona-file で評価している場合は id が揺れることがあるため、意図的であれば無視して構いません。`
    );
  }

  const quiz: QuizItem[] | undefined = dataset.knowledgeQuiz;
  if (!quiz || quiz.length === 0) {
    console.error(`エラー: データセットに knowledgeQuiz がありません（${args.datasetPath}）`);
    process.exit(1);
  }

  const systemPrompt = buildSystemPrompt(persona);
  const fewShot = buildFewShotMessages(persona);

  console.log(
    `知識クイズ評価開始: persona=${persona.id} model=${args.model} dataset=${args.datasetPath}(${quiz.length}問)`
  );

  const { items, totalCostUsd } = await runQuiz({
    apiKey,
    persona,
    systemPrompt,
    fewShot,
    quiz,
    model: args.model,
    temperature: args.temperature,
  });

  items.forEach((item: QuizItemResult) => {
    console.log(`${item.grade.correct ? "○" : "×"} ${truncate(item.question, 40)}`);
    if (!item.grade.correct) {
      console.log(`  ${summarizeGrade(item.grade)}`);
      console.log(`  応答全文: ${item.answer}`);
    }
  });

  const correctCount = items.filter((i) => i.grade.correct).length;
  const totalCount = items.length;
  const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

  console.log("\n--- 設問別結果 ---");
  console.table(
    items.map((i) => ({
      question: truncate(i.question, 40),
      correct: i.grade.correct ? "○" : "×",
      summary: summarizeGrade(i.grade),
    }))
  );

  console.log(`\n正答率: ${correctCount}/${totalCount} (${(accuracy * 100).toFixed(1)}%)`);
  console.log(`総コスト: ${totalCostUsd !== null ? `$${totalCostUsd.toFixed(6)}` : "不明"}`);

  const report: QuizReport = {
    meta: {
      persona: persona.id,
      model: args.model,
      temperature: args.temperature,
      dataset: args.datasetPath,
      createdAt: new Date().toISOString(),
      totalCostUsd,
    },
    items,
    aggregate: { correctCount, totalCount, accuracy },
  };

  const filePath = writeQuizReport(report);
  console.log(`\nレポートを書き出しました: ${filePath}`);
}

main().catch((err) => {
  console.error("知識クイズ評価スクリプトが失敗しました:", err);
  process.exit(1);
});
