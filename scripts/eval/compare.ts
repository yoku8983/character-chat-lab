import fs from "fs";
import { EvalReport } from "./report";
import { RateSet } from "./markers";
import { JudgeScores } from "./judge";
import { checkRegression, DEFAULT_THRESHOLDS, RegressionResult } from "./regression";

function loadReport(filePath: string): EvalReport {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ファイルが見つかりません: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as EvalReport;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function fmtDelta(before: number, after: number, pct = true): string {
  const diff = after - before;
  const sign = diff >= 0 ? "+" : "";
  return pct ? `${sign}${(diff * 100).toFixed(0)}pt` : `${sign}${diff.toFixed(2)}`;
}

function printRateSetDiff(label: string, before: RateSet, after: RateSet): void {
  console.log(
    `  ${label}: first ${fmtPct(before.firstPerson)}→${fmtPct(after.firstPerson)} (${fmtDelta(
      before.firstPerson,
      after.firstPerson
    )}) / ending ${fmtPct(before.sentenceEnding)}→${fmtPct(after.sentenceEnding)} (${fmtDelta(
      before.sentenceEnding,
      after.sentenceEnding
    )}) / catch ${fmtPct(before.catchphrase)}→${fmtPct(after.catchphrase)} (${fmtDelta(
      before.catchphrase,
      after.catchphrase
    )})`
  );
}

function printJudgeDiff(before: JudgeScores, after: JudgeScores): void {
  let line = `  tone ${before.toneConsistency}→${after.toneConsistency} (${fmtDelta(
    before.toneConsistency,
    after.toneConsistency,
    false
  )}) / knowledge ${before.knowledgeUse}→${after.knowledgeUse} (${fmtDelta(
    before.knowledgeUse,
    after.knowledgeUse,
    false
  )}) / persona ${before.personaMaintenance}→${after.personaMaintenance} (${fmtDelta(
    before.personaMaintenance,
    after.personaMaintenance,
    false
  )}) / natural ${before.naturalness}→${after.naturalness} (${fmtDelta(
    before.naturalness,
    after.naturalness,
    false
  )})`;

  // referenceFidelity は両方に存在する場合のみ差分表示（片方に無ければ NaN を出さずスキップ）
  if (typeof before.referenceFidelity === "number" && typeof after.referenceFidelity === "number") {
    line += ` / refFidelity ${before.referenceFidelity}→${after.referenceFidelity} (${fmtDelta(
      before.referenceFidelity,
      after.referenceFidelity,
      false
    )})`;
  }

  console.log(line);
}

function printAggregateReferenceFidelityDiff(
  before: { referenceFidelity?: number },
  after: { referenceFidelity?: number }
): void {
  if (typeof before.referenceFidelity === "number" && typeof after.referenceFidelity === "number") {
    console.log(
      `  refFidelity ${before.referenceFidelity.toFixed(2)}→${after.referenceFidelity.toFixed(2)} (${fmtDelta(
        before.referenceFidelity,
        after.referenceFidelity,
        false
      )})`
    );
  }
}

function readNumberOption(args: string[], name: string): number | null {
  const idx = args.indexOf(name);
  if (idx === -1) {
    return null;
  }
  const raw = args[idx + 1];
  const value = Number(raw);
  if (raw === undefined || Number.isNaN(value)) {
    console.error(`${name} には数値を指定してください（指定値: ${raw}）`);
    process.exit(1);
  }
  return value;
}

function fmtJudgeValue(n: number): string {
  return n.toFixed(2);
}

function printCheckResult(result: RegressionResult): void {
  console.log("\n--- 回帰チェック ---");
  const rows = result.findings.map((f) => ({
    観点: f.metric,
    基準値: f.kind === "marker" ? fmtPct(f.baseline) : fmtJudgeValue(f.baseline),
    今回値: f.kind === "marker" ? fmtPct(f.current) : fmtJudgeValue(f.current),
    差分: f.kind === "marker" ? fmtPct(f.delta) : fmtJudgeValue(f.delta),
    判定: f.failed ? "FAIL" : "OK",
  }));
  console.table(rows);

  for (const s of result.skipped) {
    console.log(`（スキップ）${s}`);
  }

  if (result.pass) {
    console.log("✅ 回帰チェック PASS");
  } else {
    const failedCount = result.findings.filter((f) => f.failed).length;
    console.log(`❌ 回帰チェック FAIL（${failedCount} 観点が閾値超の下落）`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const [beforePath, afterPath] = positional;

  if (!beforePath || !afterPath) {
    console.error(
      "使い方: npm run eval:compare -- <before.json> <after.json> [--check] [--judge-threshold 0.5] [--marker-threshold 15]"
    );
    process.exit(1);
  }

  const check = args.includes("--check");
  const judgeThreshold = readNumberOption(args, "--judge-threshold") ?? DEFAULT_THRESHOLDS.judgeDrop;
  const markerThresholdPt = readNumberOption(args, "--marker-threshold");
  const markerThreshold =
    markerThresholdPt !== null ? markerThresholdPt / 100 : DEFAULT_THRESHOLDS.markerDropRate;

  const before = loadReport(beforePath);
  const after = loadReport(afterPath);

  console.log("=== 比較: before → after ===");
  console.log(`before: ${before.meta.persona} / ${before.meta.model} / t=${before.meta.temperature ?? "default"} (${beforePath})`);
  console.log(`after : ${after.meta.persona} / ${after.meta.model} / t=${after.meta.temperature ?? "default"} (${afterPath})`);

  console.log("\n--- 全体平均 ---");
  console.log(" drift (late rate):");
  printRateSetDiff("late", before.aggregate.drift.late, after.aggregate.drift.late);
  console.log(" drift (delta = late - early):");
  printRateSetDiff("delta", before.aggregate.drift.delta, after.aggregate.drift.delta);
  console.log(" judge:");
  printJudgeDiff(before.aggregate.judge, after.aggregate.judge);
  printAggregateReferenceFidelityDiff(before.aggregate, after.aggregate);

  console.log("\n--- シナリオ別 ---");
  const beforeById = new Map(before.scenarios.map((s) => [s.scenarioId, s]));
  const afterById = new Map(after.scenarios.map((s) => [s.scenarioId, s]));
  const allIds = new Set([...beforeById.keys(), ...afterById.keys()]);

  for (const id of allIds) {
    const b = beforeById.get(id);
    const a = afterById.get(id);
    if (!b || !a) {
      console.log(`\n[${id}] before/after のどちらかに存在しません（スキップ）`);
      continue;
    }
    console.log(`\n[${id}] (${a.axis})`);
    printRateSetDiff("late ", b.drift.late, a.drift.late);
    printRateSetDiff("delta", b.drift.delta, a.drift.delta);
    printJudgeDiff(b.judge, a.judge);
  }

  if (check) {
    if (before.meta.persona !== after.meta.persona || before.meta.model !== after.meta.model) {
      console.log("⚠️ 構成が異なります（persona/model）。同一構成での比較を推奨します");
    }

    const result = checkRegression(before, after, {
      judgeDrop: judgeThreshold,
      markerDropRate: markerThreshold,
    });
    printCheckResult(result);
    process.exit(result.pass ? 0 : 1);
  }
}

main();
