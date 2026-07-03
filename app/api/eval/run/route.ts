import { NextRequest } from "next/server";
import { isEvalUiEnabled } from "@/lib/eval-ui/guard";
import {
  EvalJobParams,
  tryStartJob,
  updateProgress,
  finishJob,
  isCancelRequested,
} from "@/lib/eval-ui/job-store";
import { ensureDb } from "@/lib/db";
import { getPersona } from "@/lib/db-personas";
import { buildSystemPrompt, buildFewShotMessages } from "@/lib/prompt";
import { Persona } from "@/lib/types";
import { loadPersonaSource } from "../../../../scripts/eval/persona-loader";
import { deriveMarkers } from "../../../../scripts/eval/markers";
import { loadDataset } from "../../../../scripts/eval/dataset";
import { SCENARIOS } from "../../../../scripts/eval/scenarios";
import { runEval } from "../../../../scripts/eval/harness";
import { runQuiz, writeQuizReport, QuizReport } from "../../../../scripts/eval/quiz-runner";
import { writeReport } from "../../../../scripts/eval/report";

const DEFAULT_JUDGE_MODEL = "google/gemini-3.1-flash-lite";
const FIXED_MAX_HISTORY = 30;

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

async function resolvePersona(params: EvalJobParams): Promise<Persona> {
  if (params.personaFile) {
    return loadPersonaSource({ file: params.personaFile });
  }

  const client = await ensureDb();
  const persona = await getPersona(client, params.personaId as string);
  if (!persona) {
    throw new Error(`ペルソナ "${params.personaId}" が見つかりません`);
  }
  return persona;
}

async function runJob(jobId: string, params: EvalJobParams, apiKey: string): Promise<void> {
  try {
    const persona = await resolvePersona(params);
    const systemPrompt = buildSystemPrompt(persona);
    const fewShot = buildFewShotMessages(persona);
    const dataset = params.datasetPath ? loadDataset(params.datasetPath) : undefined;

    if (params.kind === "quiz") {
      if (!dataset || !dataset.knowledgeQuiz || dataset.knowledgeQuiz.length === 0) {
        throw new Error("データセットに knowledgeQuiz がありません");
      }

      const { items, totalCostUsd, cancelled } = await runQuiz({
        apiKey,
        persona,
        systemPrompt,
        fewShot,
        quiz: dataset.knowledgeQuiz,
        model: params.model,
        temperature: params.temperature,
        onProgress: (p) => {
          updateProgress(jobId, {
            current: p.itemIndex + 1,
            total: p.itemCount,
            detail: `設問 ${p.itemIndex + 1}/${p.itemCount}`,
          });
        },
        shouldCancel: () => isCancelRequested(jobId),
      });

      const correctCount = items.filter((i) => i.grade.correct).length;
      const totalCount = items.length;
      const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

      const report: QuizReport = {
        meta: {
          persona: persona.id,
          model: params.model,
          temperature: params.temperature,
          dataset: params.datasetPath as string,
          createdAt: new Date().toISOString(),
          totalCostUsd,
        },
        items,
        aggregate: { correctCount, totalCount, accuracy },
      };

      const filePath = writeQuizReport(report);
      finishJob(jobId, { status: cancelled ? "cancelled" : "done", reportPath: filePath });
      return;
    }

    const markers = deriveMarkers(persona);
    const scenarios =
      params.scenariosCount !== null && Number.isFinite(params.scenariosCount) && params.scenariosCount > 0
        ? SCENARIOS.slice(0, params.scenariosCount)
        : SCENARIOS;

    const judgeModel = process.env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;

    const { report, cancelled } = await runEval({
      apiKey,
      persona,
      systemPrompt,
      fewShot,
      markers,
      model: params.model,
      temperature: params.temperature,
      judgeModel,
      maxHistory: FIXED_MAX_HISTORY,
      scenarios,
      maxTurns: params.maxTurns,
      dataset,
      datasetPath: params.datasetPath,
      onProgress: (p) => {
        updateProgress(jobId, {
          current: p.scenarioIndex + 1,
          total: p.scenarioCount,
          detail: `シナリオ ${p.scenarioIndex + 1}/${p.scenarioCount}: ${p.scenarioId} ターン ${
            p.turnIndex + 1
          }/${p.turnCount}`,
        });
      },
      shouldCancel: () => isCancelRequested(jobId),
    });

    const filePath = writeReport(report);
    finishJob(jobId, { status: cancelled ? "cancelled" : "done", reportPath: filePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishJob(jobId, { status: "failed", error: message });
  }
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
