import fs from "fs";
import path from "path";
import { isEvalUiEnabled } from "@/lib/eval-ui/guard";
import { REPORTS_DIR } from "../../../../scripts/eval/report";

interface ReportListItem {
  filename: string;
  kind: "eval" | "quiz";
  createdAt: string;
  persona: string;
  model: string;
  judgeAvg: number | null;
  referenceFidelity: number | null;
  accuracy: number | null;
  totalCostUsd: number | null;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractListItem(filename: string, data: any): ReportListItem | null {
  if (typeof data !== "object" || data === null || typeof data.meta !== "object" || data.meta === null) {
    return null;
  }

  const isQuiz = filename.startsWith("quiz-");
  const meta = data.meta;

  if (typeof meta.persona !== "string" || typeof meta.model !== "string" || typeof meta.createdAt !== "string") {
    return null;
  }

  const totalCostUsd = typeof meta.totalCostUsd === "number" ? meta.totalCostUsd : null;

  if (isQuiz) {
    const accuracy =
      typeof data.aggregate === "object" && data.aggregate !== null && typeof data.aggregate.accuracy === "number"
        ? data.aggregate.accuracy
        : null;

    return {
      filename,
      kind: "quiz",
      createdAt: meta.createdAt,
      persona: meta.persona,
      model: meta.model,
      judgeAvg: null,
      referenceFidelity: null,
      accuracy,
      totalCostUsd,
    };
  }

  const aggregate = data.aggregate;
  let judgeAvg: number | null = null;
  let referenceFidelity: number | null = null;
  if (typeof aggregate === "object" && aggregate !== null && typeof aggregate.judge === "object" && aggregate.judge !== null) {
    const j = aggregate.judge;
    if (
      typeof j.toneConsistency === "number" &&
      typeof j.knowledgeUse === "number" &&
      typeof j.personaMaintenance === "number" &&
      typeof j.naturalness === "number"
    ) {
      judgeAvg = average([j.toneConsistency, j.knowledgeUse, j.personaMaintenance, j.naturalness]);
    }
    if (typeof aggregate.referenceFidelity === "number") {
      referenceFidelity = aggregate.referenceFidelity;
    }
  }

  return {
    filename,
    kind: "eval",
    createdAt: meta.createdAt,
    persona: meta.persona,
    model: meta.model,
    judgeAvg,
    referenceFidelity,
    accuracy: null,
    totalCostUsd,
  };
}

export async function GET() {
  if (!isEvalUiEnabled()) {
    return new Response(null, { status: 404 });
  }

  if (!fs.existsSync(REPORTS_DIR)) {
    return Response.json([]);
  }

  const filenames = fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".json"));

  const items: ReportListItem[] = [];
  for (const filename of filenames) {
    try {
      const content = fs.readFileSync(path.join(REPORTS_DIR, filename), "utf-8");
      const data = JSON.parse(content);
      const item = extractListItem(filename, data);
      if (item) {
        items.push(item);
      }
    } catch {
      // パース不能ファイルはスキップ
    }
  }

  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  return Response.json(items);
}
