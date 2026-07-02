import fs from "fs";
import path from "path";
import { DriftStats, RateSet } from "./markers";
import { JudgeScores } from "./judge";

export interface ScenarioResult {
  scenarioId: string;
  axis: string;
  turns: number;
  drift: DriftStats;
  judge: JudgeScores;
}

export interface EvalReport {
  meta: {
    persona: string;
    model: string;
    temperature: number | null;
    judgeModel: string;
    maxHistory: number;
    createdAt: string;
    totalCostUsd: number | null;
  };
  scenarios: ScenarioResult[];
  aggregate: {
    drift: DriftStats;
    judge: JudgeScores;
  };
}

const REPORTS_DIR = path.join(process.cwd(), "eval", "reports");

function sanitizeForFilename(value: string): string {
  return value.replace(/[/:]/g, "_").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function averageRateSet(sets: RateSet[]): RateSet {
  return {
    firstPerson: average(sets.map((s) => s.firstPerson)),
    sentenceEnding: average(sets.map((s) => s.sentenceEnding)),
    catchphrase: average(sets.map((s) => s.catchphrase)),
  };
}

/**
 * 全シナリオの drift/judge を単純平均する。scenarios が空の場合は
 * ゼロ値で埋めたスタブを返す（呼び出し側でシナリオ0件は起きない想定だが安全策）。
 */
export function computeAggregate(scenarios: ScenarioResult[]): EvalReport["aggregate"] {
  if (scenarios.length === 0) {
    const emptyRateSet: RateSet = { firstPerson: 0, sentenceEnding: 0, catchphrase: 0 };
    return {
      drift: { early: emptyRateSet, late: emptyRateSet, delta: emptyRateSet },
      judge: { toneConsistency: 0, knowledgeUse: 0, personaMaintenance: 0, naturalness: 0, comment: "" },
    };
  }

  const drift: DriftStats = {
    early: averageRateSet(scenarios.map((s) => s.drift.early)),
    late: averageRateSet(scenarios.map((s) => s.drift.late)),
    delta: averageRateSet(scenarios.map((s) => s.drift.delta)),
  };

  const judge: JudgeScores = {
    toneConsistency: average(scenarios.map((s) => s.judge.toneConsistency)),
    knowledgeUse: average(scenarios.map((s) => s.judge.knowledgeUse)),
    personaMaintenance: average(scenarios.map((s) => s.judge.personaMaintenance)),
    naturalness: average(scenarios.map((s) => s.judge.naturalness)),
    comment: "",
  };

  return { drift, judge };
}

export function writeReport(report: EvalReport): string {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const createdAtSafe = sanitizeForFilename(report.meta.createdAt);
  const personaSafe = sanitizeForFilename(report.meta.persona);
  const modelSafe = sanitizeForFilename(report.meta.model);
  const tempSafe = report.meta.temperature === null ? "default" : String(report.meta.temperature);

  const filename = `${createdAtSafe}-${personaSafe}-${modelSafe}-t${tempSafe}.json`;
  const filePath = path.join(REPORTS_DIR, filename);

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filePath;
}

function formatRateSet(r: RateSet): string {
  return `first=${(r.firstPerson * 100).toFixed(0)}% ending=${(r.sentenceEnding * 100).toFixed(
    0
  )}% catch=${(r.catchphrase * 100).toFixed(0)}%`;
}

export function printSummary(report: EvalReport): void {
  const { meta, scenarios, aggregate } = report;

  console.log("\n=== 評価サマリ ===");
  console.log(`ペルソナ: ${meta.persona}`);
  console.log(`モデル: ${meta.model}${meta.temperature !== null ? ` (temperature=${meta.temperature})` : ""}`);
  console.log(`Judge: ${meta.judgeModel}`);
  console.log(`maxHistory: ${meta.maxHistory}`);
  console.log(`作成日時: ${meta.createdAt}`);
  console.log(`総コスト: ${meta.totalCostUsd !== null ? `$${meta.totalCostUsd.toFixed(6)}` : "不明"}`);

  console.log("\n--- シナリオ別 ---");
  console.table(
    scenarios.map((s) => ({
      scenario: s.scenarioId,
      axis: s.axis,
      turns: s.turns,
      "late(first/end/catch)": formatRateSet(s.drift.late),
      "delta(first/end/catch)": formatRateSet(s.drift.delta),
      tone: s.judge.toneConsistency,
      knowledge: s.judge.knowledgeUse,
      persona: s.judge.personaMaintenance,
      natural: s.judge.naturalness,
    }))
  );

  console.log("\n--- 全体平均 ---");
  console.log(`ドリフト early: ${formatRateSet(aggregate.drift.early)}`);
  console.log(`ドリフト late : ${formatRateSet(aggregate.drift.late)}`);
  console.log(`ドリフト delta: ${formatRateSet(aggregate.drift.delta)}`);
  console.log(
    `Judge 平均: toneConsistency=${aggregate.judge.toneConsistency.toFixed(2)} knowledgeUse=${aggregate.judge.knowledgeUse.toFixed(
      2
    )} personaMaintenance=${aggregate.judge.personaMaintenance.toFixed(
      2
    )} naturalness=${aggregate.judge.naturalness.toFixed(2)}`
  );
}
