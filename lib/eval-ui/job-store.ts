/**
 * 評価 GUI 用の単一ジョブストア(モジュールスコープの in-memory 状態)。
 *
 * Next.js の dev/standalone サーバーは単一 Node プロセスとして動作するため、
 * モジュールスコープの変数で「同時に実行できる評価ジョブは 1 つまで」を表現する。
 * 永続化はしない(意図的な設計。docs 参照)。
 */

export interface EvalJobParams {
  kind: "eval" | "quiz";
  personaId?: string;
  personaFile?: string;
  datasetPath?: string;
  model: string;
  temperature: number | null;
  scenariosCount: number | null;
  maxTurns: number | null;
}

export interface EvalJobState {
  id: string;
  kind: "eval" | "quiz";
  status: "running" | "done" | "failed" | "cancelled";
  params: EvalJobParams;
  progress: { current: number; total: number; detail: string } | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  reportPath: string | null;
}

let currentJob: EvalJobState | null = null;
let cancelRequested = false;

export function getCurrentJob(): EvalJobState | null {
  return currentJob;
}

export function tryStartJob(params: EvalJobParams): EvalJobState | null {
  if (currentJob !== null && currentJob.status === "running") {
    return null;
  }

  const job: EvalJobState = {
    id: Date.now().toString(36),
    kind: params.kind,
    status: "running",
    params,
    progress: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    reportPath: null,
  };

  currentJob = job;
  cancelRequested = false;

  return job;
}

export function updateProgress(
  id: string,
  progress: EvalJobState["progress"]
): void {
  if (currentJob === null || currentJob.id !== id) {
    return;
  }
  currentJob.progress = progress;
}

export function finishJob(
  id: string,
  result: { status: "done" | "failed" | "cancelled"; error?: string; reportPath?: string }
): void {
  if (currentJob === null || currentJob.id !== id) {
    return;
  }
  currentJob.status = result.status;
  currentJob.finishedAt = new Date().toISOString();
  currentJob.error = result.error ?? null;
  currentJob.reportPath = result.reportPath ?? null;
}

export function requestCancel(): boolean {
  if (currentJob !== null && currentJob.status === "running") {
    cancelRequested = true;
    return true;
  }
  return false;
}

export function isCancelRequested(id: string): boolean {
  if (currentJob === null || currentJob.id !== id) {
    return false;
  }
  return cancelRequested;
}
