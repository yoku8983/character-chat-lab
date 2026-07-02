import { loadEnv } from "./env";
import { loadPersonaSource } from "./persona-loader";
import { deriveMarkers } from "./markers";
import { SCENARIOS, Scenario } from "./scenarios";
import { runEval } from "./harness";
import { writeSweepReport, SweepRunSummary } from "./report";
import { buildSystemPrompt, buildFewShotMessages } from "../../lib/prompt";

const DEFAULT_MODELS = [
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
  "google/gemini-3.1-flash-lite",
  "x-ai/grok-4.3",
];
const DEFAULT_TEMPS = ["0.3", "0.7", "1.0"];
const DEFAULT_JUDGE_MODEL = "google/gemini-3.1-flash-lite";
const DEFAULT_MAX_HISTORY = 30;

interface CliArgs {
  personaId?: string;
  personaFile?: string;
  models: string[];
  temps: (number | null)[];
  judgeModel: string;
  maxHistory: number;
  scenariosCount: number | null;
  maxTurns: number | null;
}

function printUsage(): void {
  console.log(`使い方:
  npm run eval:sweep -- --persona <id> [options]
  npm run eval:sweep -- --persona-file <path> [options]

オプション:
  --persona <id>          ペルソナ ID（personas/*.yaml から読み込み）
  --persona-file <path>   ペルソナ定義ファイル（YAML/JSON）のパス
  --models <csv>          比較対象モデル（既定: ${DEFAULT_MODELS.join(",")}）
  --temps <csv>           比較対象 temperature（既定: ${DEFAULT_TEMPS.join(
    ","
  )}。"default" 指定でモデル既定値=未指定を含められる）
  --judge <id>            Judge モデル（既定: env EVAL_JUDGE_MODEL または ${DEFAULT_JUDGE_MODEL}）
  --max-history <n>       履歴上限（既定: ${DEFAULT_MAX_HISTORY}、0 で無制限）
  --scenarios <n>         先頭 n 本のシナリオのみ実行（既定: 全 ${SCENARIOS.length} 本）
  --max-turns <n>         各シナリオの発話を先頭 n 個に切る（既定: 無制限）

--persona か --persona-file のどちらかが必須です。
コスト注意: 構成数（models × temps）× シナリオ数 × ターン数の分だけ API 呼び出しが発生します。`);
}

function parseTemps(csv: string): (number | null)[] {
  return csv.split(",").map((raw) => {
    const s = raw.trim();
    if (s.toLowerCase() === "default") return null;
    return Number(s);
  });
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    models: DEFAULT_MODELS,
    temps: parseTemps(DEFAULT_TEMPS.join(",")),
    judgeModel: process.env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL,
    maxHistory: DEFAULT_MAX_HISTORY,
    scenariosCount: null,
    maxTurns: null,
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
      case "--models":
        args.models = next()
          .split(",")
          .map((m) => m.trim())
          .filter((m) => m.length > 0);
        break;
      case "--temps":
        args.temps = parseTemps(next());
        break;
      case "--judge":
        args.judgeModel = next();
        break;
      case "--max-history":
        args.maxHistory = Number(next());
        break;
      case "--scenarios":
        args.scenariosCount = Number(next());
        break;
      case "--max-turns":
        args.maxTurns = Number(next());
        break;
      default:
        console.warn(`不明な引数を無視します: ${arg}`);
    }
  }

  return args;
}

function tempLabel(temperature: number | null): string {
  return temperature === null ? "default" : String(temperature);
}

function modelShortName(model: string): string {
  const segments = model.split("/");
  return segments[segments.length - 1] ?? model;
}

function estimateAvgTurns(scenarios: Scenario[], maxTurns: number | null): number {
  if (scenarios.length === 0) return 0;
  const totalTurns = scenarios.reduce((sum, s) => {
    const turns =
      maxTurns !== null && Number.isFinite(maxTurns) && maxTurns > 0
        ? Math.min(maxTurns, s.userTurns.length)
        : s.userTurns.length;
    return sum + turns;
  }, 0);
  return totalTurns / scenarios.length;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function formatDelta(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(0)}pt`;
}

function formatCost(n: number | null): string {
  return n !== null ? `$${n.toFixed(4)}` : "不明";
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

  const persona = loadPersonaSource({ id: args.personaId, file: args.personaFile });
  const markers = deriveMarkers(persona);
  const systemPrompt = buildSystemPrompt(persona);
  const fewShot = buildFewShotMessages(persona);

  const scenarios =
    args.scenariosCount !== null && Number.isFinite(args.scenariosCount) && args.scenariosCount > 0
      ? SCENARIOS.slice(0, args.scenariosCount)
      : SCENARIOS;

  const configCount = args.models.length * args.temps.length;
  const avgTurns = estimateAvgTurns(scenarios, args.maxTurns);
  const estimatedChatCalls = Math.round(configCount * scenarios.length * avgTurns);
  const estimatedJudgeCalls = configCount * scenarios.length;

  console.log(
    `スイープ開始: persona=${persona.id} models=${args.models.length} temps=${args.temps.length} (構成数=${configCount}) scenarios=${scenarios.length}本`
  );
  console.log(
    `推定 API 呼び出し回数: 約 ${estimatedChatCalls + estimatedJudgeCalls} 回（chat約${estimatedChatCalls}回 + judge約${estimatedJudgeCalls}回）。コストにご注意ください。`
  );

  const runs: SweepRunSummary[] = [];
  let grandTotalCost: number | null = null;

  for (const model of args.models) {
    for (const temperature of args.temps) {
      const logPrefix = `[${modelShortName(model)}@${tempLabel(temperature)}] `;
      console.log(`\n${logPrefix}--- 構成開始 ---`);

      const { report, skippedCount } = await runEval({
        apiKey,
        persona,
        systemPrompt,
        fewShot,
        markers,
        model,
        temperature,
        judgeModel: args.judgeModel,
        maxHistory: args.maxHistory,
        scenarios,
        maxTurns: args.maxTurns,
        logPrefix,
      });

      if (report.meta.totalCostUsd !== null) {
        grandTotalCost = (grandTotalCost ?? 0) + report.meta.totalCostUsd;
      }

      runs.push({
        model,
        temperature,
        aggregate: report.aggregate,
        totalCostUsd: report.meta.totalCostUsd,
        skippedCount,
      });
    }
  }

  console.log("\n=== スイープ比較表 ===");
  console.table(
    runs.map((r) => ({
      構成: `${modelShortName(r.model)}@${tempLabel(r.temperature)}`,
      "late一人称%": formatPct(r.aggregate.drift.late.firstPerson),
      "late語尾%": formatPct(r.aggregate.drift.late.sentenceEnding),
      "Δ一人称": formatDelta(r.aggregate.drift.delta.firstPerson),
      "Δ語尾": formatDelta(r.aggregate.drift.delta.sentenceEnding),
      tone: r.aggregate.judge.toneConsistency.toFixed(2),
      knowledge: r.aggregate.judge.knowledgeUse.toFixed(2),
      persona: r.aggregate.judge.personaMaintenance.toFixed(2),
      natural: r.aggregate.judge.naturalness.toFixed(2),
      cost: formatCost(r.totalCostUsd),
      skip: r.skippedCount,
    }))
  );

  console.log(`\n総コスト合計: ${formatCost(grandTotalCost)}`);

  const filePath = writeSweepReport({
    meta: {
      persona: persona.id,
      judgeModel: args.judgeModel,
      maxHistory: args.maxHistory,
      scenarios: scenarios.length,
      maxTurns: args.maxTurns,
      createdAt: new Date().toISOString(),
    },
    runs,
  });

  console.log(`スイープレポートを書き出しました: ${filePath}`);
}

main().catch((err) => {
  console.error("スイープスクリプトが失敗しました:", err);
  process.exit(1);
});
