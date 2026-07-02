import fs from "fs";
import { EvalReport } from "./report";
import { RateSet } from "./markers";
import { JudgeScores } from "./judge";

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
  console.log(
    `  tone ${before.toneConsistency}→${after.toneConsistency} (${fmtDelta(
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
    )})`
  );
}

function main(): void {
  const [beforePath, afterPath] = process.argv.slice(2);

  if (!beforePath || !afterPath) {
    console.error("使い方: npm run eval:compare -- <before.json> <after.json>");
    process.exit(1);
  }

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
}

main();
