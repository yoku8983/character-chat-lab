import { EvalJobParams, updateProgress, finishJob, isCancelRequested } from "@/lib/eval-ui/job-store";
import { ensureDb } from "@/lib/db";
import { getPersona } from "@/lib/db-personas";
import { buildSystemPrompt, buildFewShotMessages } from "@/lib/prompt";
import { Persona } from "@/lib/types";
import { loadPersonaSource } from "@/scripts/eval/persona-loader";
import { deriveMarkers } from "@/scripts/eval/markers";
import { loadDataset } from "@/scripts/eval/dataset";
import { SCENARIOS } from "@/scripts/eval/scenarios";
import { runEval } from "@/scripts/eval/harness";
import { runQuiz, writeQuizReport, QuizReport } from "@/scripts/eval/quiz-runner";
import { writeReport, EvalReport } from "@/scripts/eval/report";
import { checkRegression } from "@/scripts/eval/regression";

const DEFAULT_JUDGE_MODEL = "google/gemini-3.1-flash-lite";
const FIXED_MAX_HISTORY = 30;

export async function resolvePersona(params: {
  personaId?: string;
  personaFile?: string;
}): Promise<Persona> {
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

export async function runJob(
  jobId: string,
  params: EvalJobParams,
  apiKey: string,
  baseline?: EvalReport
): Promise<void> {
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
    const regression = baseline ? checkRegression(baseline, report) : undefined;
    finishJob(jobId, { status: cancelled ? "cancelled" : "done", reportPath: filePath, regression });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishJob(jobId, { status: "failed", error: message });
  }
}
