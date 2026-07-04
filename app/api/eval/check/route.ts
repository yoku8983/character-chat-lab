import fs from "fs";
import { NextRequest } from "next/server";
import { isEvalUiEnabled } from "@/lib/eval-ui/guard";
import { loadBaseline } from "@/lib/eval-ui/baseline";
import { EvalJobParams, tryStartJob } from "@/lib/eval-ui/job-store";
import { resolvePersona, runJob } from "@/lib/eval-ui/run-eval-job";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  if (!isEvalUiEnabled()) {
    return new Response(null, { status: 404 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return jsonError("OPENROUTER_API_KEY が設定されていません", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("リクエストボディが JSON として不正です", 400);
  }

  if (typeof body !== "object" || body === null) {
    return jsonError("リクエストボディが不正です", 400);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as any;

  if (typeof b.personaId !== "string" || b.personaId.length === 0) {
    return jsonError("personaId を指定してください", 400);
  }

  const personaId: string = b.personaId;
  const personaFile: string | undefined =
    typeof b.personaFile === "string" && b.personaFile.length > 0 ? b.personaFile : undefined;

  const baseline = loadBaseline(personaId);
  if (baseline === null) {
    return jsonError(
      "このペルソナのベースラインがありません。先に評価を実行し、結果をベースラインに設定してください",
      404
    );
  }

  const model = baseline.meta.model;
  const temperature = baseline.meta.temperature;
  const scenariosCount = baseline.scenarios.length;
  const maxTurns = Math.max(...baseline.scenarios.map((s) => s.turns));
  const datasetPath = baseline.meta.dataset?.path ?? undefined;

  if (datasetPath && !fs.existsSync(datasetPath)) {
    return jsonError(
      `ベースラインのデータセット ${datasetPath} が見つかりません。パスを確認するか、ベースラインを取り直してください`,
      400
    );
  }

  const params: EvalJobParams = {
    kind: "eval",
    ...(personaFile ? { personaFile } : { personaId }),
    ...(datasetPath ? { datasetPath } : {}),
    model,
    temperature,
    scenariosCount,
    maxTurns,
    check: true,
  };

  try {
    await resolvePersona(params);
  } catch {
    return jsonError(
      `ペルソナ ${personaId} が DB にありません。ファイルベースのペルソナは personaFile を指定してください`,
      400
    );
  }

  const job = tryStartJob(params);
  if (job === null) {
    return jsonError("別の評価が実行中です", 409);
  }

  void runJob(job.id, params, apiKey, baseline);

  return new Response(JSON.stringify({ jobId: job.id }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}
