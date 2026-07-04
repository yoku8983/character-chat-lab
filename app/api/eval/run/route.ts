import { NextRequest } from "next/server";
import { isEvalUiEnabled } from "@/lib/eval-ui/guard";
import { EvalJobParams, tryStartJob } from "@/lib/eval-ui/job-store";
import { runJob } from "@/lib/eval-ui/run-eval-job";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validateParams(body: unknown): EvalJobParams | string {
  if (typeof body !== "object" || body === null) {
    return "リクエストボディが不正です";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as any;

  if (b.kind !== "eval" && b.kind !== "quiz") {
    return "kind は \"eval\" または \"quiz\" を指定してください";
  }

  const hasPersonaId = typeof b.personaId === "string" && b.personaId.length > 0;
  const hasPersonaFile = typeof b.personaFile === "string" && b.personaFile.length > 0;
  if (!hasPersonaId && !hasPersonaFile) {
    return "personaId か personaFile のどちらかを指定してください";
  }

  if (b.kind === "quiz" && !(typeof b.datasetPath === "string" && b.datasetPath.length > 0)) {
    return "quiz の場合 datasetPath は必須です";
  }

  if (b.datasetPath !== undefined && typeof b.datasetPath !== "string") {
    return "datasetPath は文字列で指定してください";
  }

  if (typeof b.model !== "string" || b.model.length === 0) {
    return "model は必須です";
  }

  if (b.temperature !== undefined && b.temperature !== null && typeof b.temperature !== "number") {
    return "temperature は数値または null で指定してください";
  }

  if (b.scenariosCount !== undefined && b.scenariosCount !== null && typeof b.scenariosCount !== "number") {
    return "scenariosCount は数値または null で指定してください";
  }

  if (b.maxTurns !== undefined && b.maxTurns !== null && typeof b.maxTurns !== "number") {
    return "maxTurns は数値または null で指定してください";
  }

  const params: EvalJobParams = {
    kind: b.kind,
    ...(hasPersonaId ? { personaId: b.personaId } : {}),
    ...(hasPersonaFile ? { personaFile: b.personaFile } : {}),
    ...(b.datasetPath ? { datasetPath: b.datasetPath } : {}),
    model: b.model,
    temperature: b.temperature ?? null,
    scenariosCount: b.scenariosCount ?? null,
    maxTurns: b.maxTurns ?? null,
  };

  return params;
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

  const validated = validateParams(body);
  if (typeof validated === "string") {
    return jsonError(validated, 400);
  }

  const job = tryStartJob(validated);
  if (job === null) {
    return jsonError("別の評価が実行中です", 409);
  }

  void runJob(job.id, validated, apiKey);

  return new Response(JSON.stringify({ jobId: job.id }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}
