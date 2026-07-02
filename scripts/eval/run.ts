import { loadEnv } from "./env";
import { chatCompletion } from "./openrouter";
import { loadPersonaSource } from "./persona-loader";
import { deriveMarkers, scoreText, computeDrift, TurnHit } from "./markers";
import { SCENARIOS } from "./scenarios";
import { judgeConversation } from "./judge";
import { writeReport, printSummary, computeAggregate, EvalReport, ScenarioResult } from "./report";
import { buildSystemPrompt, buildFewShotMessages } from "../../lib/prompt";
import { capMessageHistory } from "../../lib/history";
import { ChatMessage } from "../../lib/types";

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_JUDGE_MODEL = "google/gemini-3.1-flash-lite";
const DEFAULT_MAX_HISTORY = 30;

interface CliArgs {
  personaId?: string;
  personaFile?: string;
  model: string;
  temperature: number | null;
  judgeModel: string;
  maxHistory: number;
  scenariosCount: number | null;
  maxTurns: number | null;
}

function printUsage(): void {
  console.log(`使い方:
  npm run eval -- --persona <id> [options]
  npm run eval -- --persona-file <path> [options]

オプション:
  --persona <id>          ペルソナ ID（personas/*.yaml から読み込み）
  --persona-file <path>   ペルソナ定義ファイル（YAML/JSON）のパス
  --model <id>            被評価モデル（既定: ${DEFAULT_MODEL}）
  --temperature <num>     temperature（既定: 未指定）
  --judge <id>            Judge モデル（既定: env EVAL_JUDGE_MODEL または ${DEFAULT_JUDGE_MODEL}）
  --max-history <n>       履歴上限（既定: ${DEFAULT_MAX_HISTORY}、0 で無制限）
  --scenarios <n>         先頭 n 本のシナリオのみ実行（既定: 全 ${SCENARIOS.length} 本）
  --max-turns <n>         各シナリオの発話を先頭 n 個に切る（既定: 無制限）

--persona か --persona-file のどちらかが必須です。`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    model: DEFAULT_MODEL,
    temperature: null,
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
      case "--model":
        args.model = next();
        break;
      case "--temperature":
        args.temperature = Number(next());
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

  const scenarioResults: ScenarioResult[] = [];
  let totalCost: number | null = null;
  let skippedCount = 0;

  console.log(`評価開始: persona=${persona.id} model=${args.model} judge=${args.judgeModel} scenarios=${scenarios.length}本`);

  for (const scenario of scenarios) {
    const userTurns =
      args.maxTurns !== null && Number.isFinite(args.maxTurns) && args.maxTurns > 0
        ? scenario.userTurns.slice(0, args.maxTurns)
        : scenario.userTurns;

    console.log(`\n--- シナリオ: ${scenario.id} (${scenario.axis}) ---`);

    try {
      const history: ChatMessage[] = [];
      const hits: TurnHit[] = [];

      for (const userTurn of userTurns) {
        history.push({ role: "user", content: userTurn });

        // capMessageHistory は maxHistory<=0 を「無制限」として扱う（lib/history.ts の既存仕様）
        const capped = capMessageHistory(history, args.maxHistory);
        const apiMessages = [
          { role: "system", content: systemPrompt },
          ...fewShot,
          ...capped.map((m) => ({ role: m.role, content: m.content })),
        ];

        const result = await chatCompletion({
          apiKey,
          model: args.model,
          messages: apiMessages,
          ...(args.temperature !== null ? { temperature: args.temperature } : {}),
        });

        history.push({ role: "assistant", content: result.text });
        hits.push(scoreText(result.text, markers));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const usage: any = result.usage;
        if (usage && typeof usage.cost === "number") {
          totalCost = (totalCost ?? 0) + usage.cost;
        }
      }

      const drift = computeDrift(hits);
      const judge = await judgeConversation({
        apiKey,
        judgeModel: args.judgeModel,
        persona,
        transcript: history,
      });

      scenarioResults.push({
        scenarioId: scenario.id,
        axis: scenario.axis,
        turns: userTurns.length,
        drift,
        judge,
      });

      console.log(
        `  ターン数=${userTurns.length} late(first=${(drift.late.firstPerson * 100).toFixed(0)}% ending=${(
          drift.late.sentenceEnding * 100
        ).toFixed(0)}%) judge(tone=${judge.toneConsistency} knowledge=${judge.knowledgeUse} persona=${judge.personaMaintenance} natural=${judge.naturalness})`
      );
    } catch (err) {
      skippedCount++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  シナリオ "${scenario.id}" をスキップしました: ${message}`);
    }
  }

  const aggregate = computeAggregate(scenarioResults);

  const report: EvalReport = {
    meta: {
      persona: persona.id,
      model: args.model,
      temperature: args.temperature,
      judgeModel: args.judgeModel,
      maxHistory: args.maxHistory,
      createdAt: new Date().toISOString(),
      totalCostUsd: totalCost,
    },
    scenarios: scenarioResults,
    aggregate,
  };

  const filePath = writeReport(report);
  printSummary(report);

  console.log(`\nレポートを書き出しました: ${filePath}`);
  if (skippedCount > 0) {
    console.log(`スキップしたシナリオ数: ${skippedCount} / ${scenarios.length}`);
  }
}

main().catch((err) => {
  console.error("評価スクリプトが失敗しました:", err);
  process.exit(1);
});
