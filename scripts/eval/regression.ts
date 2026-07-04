// scripts/eval/regression.ts
// 品質回帰の合否判定。CLI (compare.ts --check) と GUI (API route) の両方が
// この関数を使うことで判定基準のズレを防ぐ。
import { EvalReport } from "./report";

export interface RegressionThresholds {
  /** Judge 観点(1〜5)の下落許容量。これ以上下がったら FAIL */
  judgeDrop: number;
  /** マーカー late 出現率(0〜1)の下落許容量。0.15 = 15 パーセントポイント */
  markerDropRate: number;
}

export const DEFAULT_THRESHOLDS: RegressionThresholds = {
  judgeDrop: 0.5,
  markerDropRate: 0.15,
};

export interface RegressionFinding {
  metric: string;
  kind: "judge" | "marker";
  baseline: number;
  current: number;
  /** current - baseline（負なら下落） */
  delta: number;
  failed: boolean;
}

export interface RegressionResult {
  pass: boolean;
  findings: RegressionFinding[];
  /** 判定できず飛ばした観点（片方のレポートに無い等）の説明 */
  skipped: string[];
}

function judgeFinding(
  metric: string,
  baseline: number,
  current: number,
  threshold: number
): RegressionFinding {
  const delta = current - baseline;
  return { metric, kind: "judge", baseline, current, delta, failed: baseline - current >= threshold };
}

function markerFinding(
  metric: string,
  baseline: number,
  current: number,
  threshold: number
): RegressionFinding {
  const delta = current - baseline;
  return { metric, kind: "marker", baseline, current, delta, failed: baseline - current >= threshold };
}

export function checkRegression(
  baseline: EvalReport,
  current: EvalReport,
  thresholds: RegressionThresholds = DEFAULT_THRESHOLDS
): RegressionResult {
  const findings: RegressionFinding[] = [];
  const skipped: string[] = [];

  const bj = baseline.aggregate.judge;
  const cj = current.aggregate.judge;
  findings.push(judgeFinding("口調一貫性", bj.toneConsistency, cj.toneConsistency, thresholds.judgeDrop));
  findings.push(judgeFinding("知識活用度", bj.knowledgeUse, cj.knowledgeUse, thresholds.judgeDrop));
  findings.push(judgeFinding("人格維持", bj.personaMaintenance, cj.personaMaintenance, thresholds.judgeDrop));
  findings.push(judgeFinding("自然さ", bj.naturalness, cj.naturalness, thresholds.judgeDrop));

  const bRef = baseline.aggregate.referenceFidelity;
  const cRef = current.aggregate.referenceFidelity;
  if (typeof bRef === "number" && typeof cRef === "number") {
    findings.push(judgeFinding("参照忠実度", bRef, cRef, thresholds.judgeDrop));
  } else if (typeof bRef === "number" || typeof cRef === "number") {
    skipped.push("参照忠実度: 片方のレポートにしか無いため判定をスキップしました");
  }

  const bLate = baseline.aggregate.drift.late;
  const cLate = current.aggregate.drift.late;
  findings.push(markerFinding("一人称 late 出現率", bLate.firstPerson, cLate.firstPerson, thresholds.markerDropRate));
  findings.push(markerFinding("語尾 late 出現率", bLate.sentenceEnding, cLate.sentenceEnding, thresholds.markerDropRate));

  return { pass: findings.every((f) => !f.failed), findings, skipped };
}
