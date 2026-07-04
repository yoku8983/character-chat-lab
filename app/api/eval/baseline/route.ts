import fs from "fs";
import path from "path";
import { isEvalUiEnabled } from "@/lib/eval-ui/guard";
import { saveBaseline, listBaselines } from "@/lib/eval-ui/baseline";
import { EvalReport, REPORTS_DIR } from "../../../../scripts/eval/report";

export async function GET() {
  if (!isEvalUiEnabled()) {
    return new Response(null, { status: 404 });
  }

  return Response.json(listBaselines());
}

export async function POST(request: Request) {
  if (!isEvalUiEnabled()) {
    return new Response(null, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "filename を指定してください" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || typeof (body as { filename?: unknown }).filename !== "string") {
    return Response.json({ error: "filename を指定してください" }, { status: 400 });
  }

  const { filename } = body as { filename: string };

  if (/[^a-zA-Z0-9._-]/.test(filename) || filename === "." || filename === "..") {
    return Response.json({ error: "ファイル名が不正です" }, { status: 400 });
  }

  if (filename.startsWith("quiz-")) {
    return Response.json(
      { error: "クイズレポートはベースラインに設定できません（多ターン評価のレポートを選んでください）" },
      { status: 400 }
    );
  }

  const filePath = path.join(REPORTS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return new Response(null, { status: 404 });
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const report = JSON.parse(content) as EvalReport;

  if (
    typeof report !== "object" ||
    report === null ||
    typeof report.aggregate !== "object" ||
    report.aggregate === null ||
    typeof report.aggregate.judge !== "object" ||
    report.aggregate.judge === null ||
    typeof report.aggregate.drift !== "object" ||
    report.aggregate.drift === null
  ) {
    return Response.json(
      { error: "このレポートはベースラインに使えません（形式が古い可能性があります）" },
      { status: 400 }
    );
  }

  saveBaseline(report);

  return Response.json({ personaId: report.meta.persona });
}
