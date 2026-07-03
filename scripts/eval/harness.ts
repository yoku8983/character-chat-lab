import { chatCompletion } from "./openrouter";
import { Markers, scoreText, computeDrift, TurnHit } from "./markers";
import { judgeConversation } from "./judge";
import { EvalReport, ScenarioResult, computeAggregate } from "./report";
import { Scenario } from "./scenarios";
import { EvalDataset } from "./dataset";
import { capMessageHistory } from "../../lib/history";
import { ChatMessage, Persona } from "../../lib/types";

export interface EvalConfig {
  apiKey: string;
  persona: Persona; // 読込済み
  systemPrompt: string; // buildSystemPrompt 済み
  fewShot: { role: string; content: string }[];
  markers: Markers; // deriveMarkers 済み
  model: string;
  temperature: number | null;
  judgeModel: string;
  maxHistory: number;
  scenarios: Scenario[]; // 実行対象（先頭 n 本など呼び出し側で絞る）
  maxTurns: number | null; // 各シナリオの発話を先頭 n 個に絞る（null=全部）
  logPrefix?: string; // 進捗ログの接頭辞（sweep で "flash@0.3 " 等）
  dataset?: EvalDataset; // 参照付き Judge 用の正解データセット（未指定なら従来どおり4観点）
  datasetPath?: string; // レポート meta 記録用（run.ts の --dataset 値）
  onProgress?: (p: EvalProgress) => void; // 進捗コールバック（GUI 等での表示用。CLI からは未使用）
  shouldCancel?: () => boolean; // true を返すとシナリオ境界で中断する（CLI からは未使用）
}

export interface EvalProgress {
  scenarioIndex: number; // 0-based
  scenarioCount: number;
  scenarioId: string;
  turnIndex: number; // 0-based。シナリオ開始時は 0
  turnCount: number;
}

export interface EvalRunResult {
  report: EvalReport;
  skippedCount: number;
  cancelled: boolean; // shouldCancel によりシナリオ境界で停止した場合 true
}

/**
 * 単一構成（persona × model × temperature）でシナリオ群を実行し、
 * 口調ドリフト検出 + LLM-as-Judge 採点を行ってレポートを組み立てる。
 * 1シナリオが失敗しても他のシナリオは継続する（スキップしてカウント）。
 */
export async function runEval(cfg: EvalConfig): Promise<EvalRunResult> {
  const prefix = cfg.logPrefix ?? "";
  const scenarioResults: ScenarioResult[] = [];
  let totalCost: number | null = null;
  let skippedCount = 0;
  let cancelled = false;
  const scenarioCount = cfg.scenarios.length;

  for (let scenarioIndex = 0; scenarioIndex < scenarioCount; scenarioIndex++) {
    if (cfg.shouldCancel?.()) {
      cancelled = true;
      break;
    }

    const scenario = cfg.scenarios[scenarioIndex];
    const userTurns =
      cfg.maxTurns !== null && Number.isFinite(cfg.maxTurns) && cfg.maxTurns > 0
        ? scenario.userTurns.slice(0, cfg.maxTurns)
        : scenario.userTurns;

    console.log(`${prefix}--- シナリオ: ${scenario.id} (${scenario.axis}) ---`);

    try {
      const history: ChatMessage[] = [];
      const hits: TurnHit[] = [];

      for (let turnIndex = 0; turnIndex < userTurns.length; turnIndex++) {
        const userTurn = userTurns[turnIndex];
        cfg.onProgress?.({
          scenarioIndex,
          scenarioCount,
          scenarioId: scenario.id,
          turnIndex,
          turnCount: userTurns.length,
        });
        history.push({ role: "user", content: userTurn });

        // capMessageHistory は maxHistory<=0 を「無制限」として扱う（lib/history.ts の既存仕様）
        const capped = capMessageHistory(history, cfg.maxHistory);
        const apiMessages = [
          { role: "system", content: cfg.systemPrompt },
          ...cfg.fewShot,
          ...capped.map((m) => ({ role: m.role, content: m.content })),
        ];

        const result = await chatCompletion({
          apiKey: cfg.apiKey,
          model: cfg.model,
          messages: apiMessages,
          ...(cfg.temperature !== null ? { temperature: cfg.temperature } : {}),
        });

        history.push({ role: "assistant", content: result.text });
        hits.push(scoreText(result.text, cfg.markers));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const usage: any = result.usage;
        if (usage && typeof usage.cost === "number") {
          totalCost = (totalCost ?? 0) + usage.cost;
        }
      }

      const drift = computeDrift(hits);
      const judge = await judgeConversation({
        apiKey: cfg.apiKey,
        judgeModel: cfg.judgeModel,
        persona: cfg.persona,
        transcript: history,
        referencePairs: cfg.dataset?.referencePairs,
      });

      scenarioResults.push({
        scenarioId: scenario.id,
        axis: scenario.axis,
        turns: userTurns.length,
        drift,
        judge,
      });

      console.log(
        `${prefix}  ターン数=${userTurns.length} late(first=${(drift.late.firstPerson * 100).toFixed(
          0
        )}% ending=${(drift.late.sentenceEnding * 100).toFixed(0)}%) judge(tone=${
          judge.toneConsistency
        } knowledge=${judge.knowledgeUse} persona=${judge.personaMaintenance} natural=${judge.naturalness})`
      );
    } catch (err) {
      skippedCount++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${prefix}  シナリオ "${scenario.id}" をスキップしました: ${message}`);
    }
  }

  const aggregate = computeAggregate(scenarioResults);

  const report: EvalReport = {
    meta: {
      persona: cfg.persona.id,
      model: cfg.model,
      temperature: cfg.temperature,
      judgeModel: cfg.judgeModel,
      maxHistory: cfg.maxHistory,
      createdAt: new Date().toISOString(),
      totalCostUsd: totalCost,
      dataset: cfg.dataset
        ? {
            ...(cfg.datasetPath ? { path: cfg.datasetPath } : {}),
            personaId: cfg.dataset.personaId,
            pairCount: cfg.dataset.referencePairs.length,
          }
        : null,
    },
    scenarios: scenarioResults,
    aggregate,
  };

  return { report, skippedCount, cancelled };
}
