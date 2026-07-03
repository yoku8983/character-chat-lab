import fs from "fs";
import path from "path";
import { isEvalUiEnabled } from "@/lib/eval-ui/guard";
import { REPORTS_DIR } from "../../../../../scripts/eval/report";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  if (!isEvalUiEnabled()) {
    return new Response(null, { status: 404 });
  }

  const { filename } = await params;

  if (/[^a-zA-Z0-9._-]/.test(filename) || filename === "." || filename === "..") {
    return new Response(JSON.stringify({ error: "ファイル名が不正です" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const filePath = path.join(REPORTS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return new Response(null, { status: 404 });
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return new Response(content, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
