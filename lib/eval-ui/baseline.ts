import fs from "fs";
import path from "path";
import { EvalReport, sanitizeForFilename } from "../../scripts/eval/report";

export const BASELINES_DIR = path.join(process.cwd(), "eval", "baselines");

export interface BaselineListItem {
  personaId: string;
  createdAt: string;
  model: string;
  scenariosCount: number;
  maxTurns: number;
  judgeAvg: number;
  referenceFidelity: number | null;
  datasetPath: string | null;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function toBaselineListItem(report: EvalReport): BaselineListItem {
  const judge = report.aggregate.judge;
  const judgeAvg = average([
    judge.toneConsistency,
    judge.knowledgeUse,
    judge.personaMaintenance,
    judge.naturalness,
  ]);

  return {
    personaId: report.meta.persona,
    createdAt: report.meta.createdAt,
    model: report.meta.model,
    scenariosCount: report.scenarios.length,
    maxTurns: Math.max(...report.scenarios.map((s) => s.turns)),
    judgeAvg,
    referenceFidelity: report.aggregate.referenceFidelity ?? null,
    datasetPath: report.meta.dataset?.path ?? null,
  };
}

export function saveBaseline(report: EvalReport): string {
  if (!fs.existsSync(BASELINES_DIR)) {
    fs.mkdirSync(BASELINES_DIR, { recursive: true });
  }

  const filename = `${sanitizeForFilename(report.meta.persona)}.json`;
  const filePath = path.join(BASELINES_DIR, filename);

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");
  return filePath;
}

export function loadBaseline(personaId: string): EvalReport | null {
  const filename = `${sanitizeForFilename(personaId)}.json`;
  const filePath = path.join(BASELINES_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as EvalReport;
}

export function listBaselines(): BaselineListItem[] {
  if (!fs.existsSync(BASELINES_DIR)) {
    return [];
  }

  const filenames = fs.readdirSync(BASELINES_DIR).filter((f) => f.endsWith(".json"));

  const items: BaselineListItem[] = [];
  for (const filename of filenames) {
    try {
      const content = fs.readFileSync(path.join(BASELINES_DIR, filename), "utf-8");
      const data = JSON.parse(content) as EvalReport;
      items.push(toBaselineListItem(data));
    } catch {
      // パース不能ファイルはスキップ
    }
  }

  return items;
}
