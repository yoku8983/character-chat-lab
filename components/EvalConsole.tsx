"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { PersonaSummary } from "@/lib/types";

interface EvalConsoleProps {
  personas: PersonaSummary[];
}

interface EvalJobParams {
  kind: "eval" | "quiz";
  personaId?: string;
  personaFile?: string;
  datasetPath?: string;
  model: string;
  temperature: number | null;
  scenariosCount: number | null;
  maxTurns: number | null;
}

interface EvalJobState {
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

interface RateSet {
  firstPerson: number;
  sentenceEnding: number;
  catchphrase: number;
}

interface DriftStats {
  early: RateSet;
  late: RateSet;
  delta: RateSet;
}

interface JudgeScores {
  toneConsistency: number;
  knowledgeUse: number;
  personaMaintenance: number;
  naturalness: number;
  referenceFidelity?: number;
  comment: string;
  failed?: boolean;
}

interface ScenarioResult {
  scenarioId: string;
  axis: string;
  turns: number;
  drift: DriftStats;
  judge: JudgeScores;
}

interface EvalReportDetail {
  meta: {
    persona: string;
    model: string;
    temperature: number | null;
    judgeModel: string;
    maxHistory: number;
    createdAt: string;
    totalCostUsd: number | null;
    dataset: { path?: string; personaId: string; pairCount: number } | null;
  };
  scenarios: ScenarioResult[];
  aggregate: {
    drift: DriftStats;
    judge: JudgeScores;
    judgeFailedCount: number;
    referenceFidelity?: number;
  };
}

interface QuizItemResult {
  question: string;
  answer: string;
  grade: { correct: boolean; failedMust: string[]; hitForbidden: string[] };
  notes?: string;
}

interface QuizReportDetail {
  meta: {
    persona: string;
    model: string;
    temperature: number | null;
    dataset: string;
    createdAt: string;
    totalCostUsd: number | null;
  };
  items: QuizItemResult[];
  aggregate: { correctCount: number; totalCount: number; accuracy: number };
}

type ReportDetail = EvalReportDetail | QuizReportDetail;

function isQuizDetail(d: ReportDetail): d is QuizReportDetail {
  return "items" in d;
}

const DEFAULT_MAX_TURNS = 16;
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

const sectionStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-secondary)",
  border: "1px solid var(--border)",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP");
}

function formatUsd(cost: number | null): string {
  if (cost === null) return "不明";
  return `$${cost.toFixed(6)}`;
}

function formatRateSet(r: RateSet): string {
  return `一人称=${(r.firstPerson * 100).toFixed(0)}% 語尾=${(r.sentenceEnding * 100).toFixed(0)}% 口癖=${(
    r.catchphrase * 100
  ).toFixed(0)}%`;
}

export default function EvalConsole({ personas }: EvalConsoleProps) {
  // フォーム状態
  const [kind, setKind] = useState<"eval" | "quiz">("eval");
  const [personaMode, setPersonaMode] = useState<"db" | "file">("db");
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "");
  const [personaFile, setPersonaFile] = useState("");
  const [datasetPath, setDatasetPath] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [temperature, setTemperature] = useState("");
  const [scenariosCount, setScenariosCount] = useState("");
  const [maxTurns, setMaxTurns] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 実行中ジョブ
  const [job, setJob] = useState<EvalJobState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 履歴
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [expandedFilename, setExpandedFilename] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<ReportDetail | null>(null);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await fetch("/api/eval/reports");
      if (res.ok) {
        const data: ReportListItem[] = await res.json();
        setReports(data);
      }
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/eval/status");
    if (!res.ok) return;
    const data: EvalJobState | null = await res.json();
    setJob(data);
    if (data === null || data.status !== "running") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (data !== null) {
        // 完了・失敗・中断のいずれでも履歴を再取得
        void fetchReports();
      }
    }
  }, [fetchReports]);

  useEffect(() => {
    void fetchReports();
    void fetchStatus();
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      void fetchStatus();
    }, 2000);
  }, [fetchStatus]);

  useEffect(() => {
    if (job?.status === "running") {
      startPolling();
    }
  }, [job?.status, startPolling]);

  const isRunning = job?.status === "running";

  const estimatedCalls = (() => {
    if (kind === "quiz") return null;
    const count = scenariosCount ? Number(scenariosCount) : null;
    const turns = maxTurns ? Number(maxTurns) : DEFAULT_MAX_TURNS;
    if (count === null) return null;
    if (!Number.isFinite(count) || !Number.isFinite(turns) || count <= 0) return null;
    return count * turns + count;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const body: Record<string, unknown> = {
      kind,
      model: model.trim() || DEFAULT_MODEL,
      temperature: temperature.trim() === "" ? null : Number(temperature),
      scenariosCount: scenariosCount.trim() === "" ? null : Number(scenariosCount),
      maxTurns: maxTurns.trim() === "" ? null : Number(maxTurns),
    };

    if (personaMode === "db") {
      body.personaId = personaId;
    } else {
      body.personaFile = personaFile.trim();
    }

    if (datasetPath.trim() !== "") {
      body.datasetPath = datasetPath.trim();
    }

    if (kind === "quiz" && datasetPath.trim() === "") {
      setFormError("quiz の場合 datasetPath は必須です");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/eval/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error ?? `実行開始に失敗しました（status ${res.status}）`);
        return;
      }
      await fetchStatus();
      startPolling();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "実行開始に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    await fetch("/api/eval/cancel", { method: "POST" });
    void fetchStatus();
  }

  async function handleRowClick(filename: string) {
    if (expandedFilename === filename) {
      setExpandedFilename(null);
      setExpandedDetail(null);
      setExpandedError(null);
      return;
    }
    setExpandedFilename(filename);
    setExpandedDetail(null);
    setExpandedError(null);
    try {
      const res = await fetch(`/api/eval/reports/${encodeURIComponent(filename)}`);
      if (!res.ok) {
        setExpandedError(`詳細の取得に失敗しました（status ${res.status}）`);
        return;
      }
      const data: ReportDetail = await res.json();
      setExpandedDetail(data);
    } catch (err) {
      setExpandedError(err instanceof Error ? err.message : "詳細の取得に失敗しました");
    }
  }

  return (
    <div className="space-y-8">
      {/* 実行フォーム */}
      <section className="rounded-xl p-4 md:p-6" style={sectionStyle}>
        <h2 className="text-base md:text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          評価を実行
        </h2>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              評価種別
            </p>
            <div className="flex gap-4">
              <label className="flex items-center gap-1 text-sm" style={{ color: "var(--text-primary)" }}>
                <input
                  type="radio"
                  name="kind"
                  checked={kind === "eval"}
                  onChange={() => setKind("eval")}
                  disabled={isRunning}
                />
                eval（人格・口調評価）
              </label>
              <label className="flex items-center gap-1 text-sm" style={{ color: "var(--text-primary)" }}>
                <input
                  type="radio"
                  name="kind"
                  checked={kind === "quiz"}
                  onChange={() => setKind("quiz")}
                  disabled={isRunning}
                />
                quiz（知識クイズ）
              </label>
            </div>
          </div>

          <div>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              ペルソナ
            </p>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-1 text-sm" style={{ color: "var(--text-primary)" }}>
                <input
                  type="radio"
                  name="personaMode"
                  checked={personaMode === "db"}
                  onChange={() => setPersonaMode("db")}
                  disabled={isRunning}
                />
                登録済みペルソナ
              </label>
              <label className="flex items-center gap-1 text-sm" style={{ color: "var(--text-primary)" }}>
                <input
                  type="radio"
                  name="personaMode"
                  checked={personaMode === "file"}
                  onChange={() => setPersonaMode("file")}
                  disabled={isRunning}
                />
                ファイルパス直接入力
              </label>
            </div>
            {personaMode === "db" ? (
              <select
                className="w-full rounded-md p-2 text-sm"
                style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                value={personaId}
                onChange={(e) => setPersonaId(e.target.value)}
                disabled={isRunning}
              >
                {personas.length === 0 && <option value="">（ペルソナがありません）</option>}
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{p.id}）
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="w-full rounded-md p-2 text-sm"
                style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                placeholder="personas/tetsu-oyaji.yaml"
                value={personaFile}
                onChange={(e) => setPersonaFile(e.target.value)}
                disabled={isRunning}
              />
            )}
          </div>

          <div>
            <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              データセットパス{kind === "quiz" && <span style={{ color: "var(--accent-hover)" }}> （必須）</span>}
            </p>
            <input
              type="text"
              className="w-full rounded-md p-2 text-sm"
              style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              placeholder="scripts/eval/datasets/example-tetsu-oyaji.json"
              value={datasetPath}
              onChange={(e) => setDatasetPath(e.target.value)}
              disabled={isRunning}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                モデル
              </p>
              <input
                type="text"
                className="w-full rounded-md p-2 text-sm"
                style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isRunning}
              />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                temperature（空=未指定）
              </p>
              <input
                type="number"
                step="0.1"
                className="w-full rounded-md p-2 text-sm"
                style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                disabled={isRunning}
              />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                シナリオ数（1〜10。空=全件）
              </p>
              <input
                type="number"
                min={1}
                max={10}
                className="w-full rounded-md p-2 text-sm"
                style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                value={scenariosCount}
                onChange={(e) => setScenariosCount(e.target.value)}
                disabled={isRunning || kind === "quiz"}
              />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                max-turns（空=既定{DEFAULT_MAX_TURNS}）
              </p>
              <input
                type="number"
                min={1}
                className="w-full rounded-md p-2 text-sm"
                style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                value={maxTurns}
                onChange={(e) => setMaxTurns(e.target.value)}
                disabled={isRunning || kind === "quiz"}
              />
            </div>
          </div>

          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {kind === "eval"
              ? estimatedCalls !== null
                ? `推定 API 呼び出し回数: 約 ${estimatedCalls} 回（シナリオ数 × max-turns + シナリオ数の概算）`
                : "推定 API 呼び出し回数: シナリオ数を指定すると概算を表示します"
              : "設問数はデータセット依存です（呼び出し回数は設問数と同程度）"}
          </p>

          {formError && (
            <p className="text-sm" style={{ color: "#e05252" }}>
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || isRunning || (personas.length === 0 && personaMode === "db")}
            className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)", color: "var(--bg-primary)" }}
          >
            {isRunning ? "実行中です" : "実行"}
          </button>
        </form>
      </section>

      {/* 実行中パネル */}
      {job && (
        <section className="rounded-xl p-4 md:p-6" style={sectionStyle}>
          <h2 className="text-base md:text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            実行状況
          </h2>
          <div className="space-y-2 text-sm" style={{ color: "var(--text-primary)" }}>
            <p>
              種別: {job.kind === "eval" ? "eval" : "quiz"} / ステータス:{" "}
              <span
                style={{
                  color:
                    job.status === "running"
                      ? "var(--accent-hover)"
                      : job.status === "done"
                        ? "#4caf50"
                        : job.status === "failed"
                          ? "#e05252"
                          : "var(--text-secondary)",
                }}
              >
                {job.status}
              </span>
            </p>
            <p style={{ color: "var(--text-secondary)" }}>開始: {formatDateTime(job.startedAt)}</p>
            {job.finishedAt && <p style={{ color: "var(--text-secondary)" }}>終了: {formatDateTime(job.finishedAt)}</p>}

            {job.progress && (
              <div>
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                  {job.progress.detail}（{job.progress.current}/{job.progress.total}）
                </p>
                <div
                  className="w-full h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
                >
                  <div
                    className="h-full"
                    style={{
                      backgroundColor: "var(--accent)",
                      width: `${
                        job.progress.total > 0
                          ? Math.min(100, Math.round((job.progress.current / job.progress.total) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

            {job.status === "failed" && job.error && (
              <p className="text-sm" style={{ color: "#e05252" }}>
                エラー: {job.error}
              </p>
            )}

            {job.status === "running" && (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md px-3 py-1.5 text-sm font-semibold"
                style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              >
                中断
              </button>
            )}
          </div>
        </section>
      )}

      {/* 履歴一覧 */}
      <section className="rounded-xl p-4 md:p-6" style={sectionStyle}>
        <h2 className="text-base md:text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          実行履歴
        </h2>
        {reportsLoading ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>読み込み中...</p>
        ) : reports.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>まだレポートがありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left py-2 pr-4" style={{ color: "var(--text-secondary)" }}>日時</th>
                  <th className="text-left py-2 px-4" style={{ color: "var(--text-secondary)" }}>種別</th>
                  <th className="text-left py-2 px-4" style={{ color: "var(--text-secondary)" }}>ペルソナ</th>
                  <th className="text-left py-2 px-4" style={{ color: "var(--text-secondary)" }}>モデル</th>
                  <th className="text-right py-2 px-4" style={{ color: "var(--text-secondary)" }}>judge平均/正答率</th>
                  <th className="text-right py-2 px-4" style={{ color: "var(--text-secondary)" }}>refFidelity</th>
                  <th className="text-right py-2 pl-4" style={{ color: "var(--text-secondary)" }}>コスト</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <Fragment key={r.filename}>
                    <tr
                      onClick={() => void handleRowClick(r.filename)}
                      className="cursor-pointer"
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td className="py-2 pr-4" style={{ color: "var(--text-primary)" }}>{formatDateTime(r.createdAt)}</td>
                      <td className="py-2 px-4" style={{ color: "var(--text-primary)" }}>{r.kind}</td>
                      <td className="py-2 px-4" style={{ color: "var(--text-primary)" }}>{r.persona}</td>
                      <td className="py-2 px-4" style={{ color: "var(--text-primary)" }}>{r.model}</td>
                      <td className="text-right py-2 px-4" style={{ color: "var(--text-primary)" }}>
                        {r.kind === "quiz"
                          ? r.accuracy !== null
                            ? `${(r.accuracy * 100).toFixed(0)}%`
                            : "-"
                          : r.judgeAvg !== null
                            ? r.judgeAvg.toFixed(2)
                            : "-"}
                      </td>
                      <td className="text-right py-2 px-4" style={{ color: "var(--text-primary)" }}>
                        {r.referenceFidelity !== null ? r.referenceFidelity.toFixed(2) : "-"}
                      </td>
                      <td className="text-right py-2 pl-4" style={{ color: "var(--text-primary)" }}>
                        {formatUsd(r.totalCostUsd)}
                      </td>
                    </tr>
                    {expandedFilename === r.filename && (
                      <tr key={`${r.filename}-detail`}>
                        <td colSpan={7} className="py-4 px-2">
                          {expandedError && (
                            <p className="text-sm" style={{ color: "#e05252" }}>
                              {expandedError}
                            </p>
                          )}
                          {!expandedError && !expandedDetail && (
                            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>読み込み中...</p>
                          )}
                          {expandedDetail && isQuizDetail(expandedDetail) && (
                            <div className="space-y-3">
                              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                                正答 {expandedDetail.aggregate.correctCount} / {expandedDetail.aggregate.totalCount}（
                                {(expandedDetail.aggregate.accuracy * 100).toFixed(0)}%）
                              </p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                      <th className="text-left py-1 pr-4" style={{ color: "var(--text-secondary)" }}>正誤</th>
                                      <th className="text-left py-1 px-4" style={{ color: "var(--text-secondary)" }}>設問</th>
                                      <th className="text-left py-1 pl-4" style={{ color: "var(--text-secondary)" }}>応答</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedDetail.items.map((item, i) => (
                                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                        <td className="py-1 pr-4" style={{ color: item.grade.correct ? "#4caf50" : "#e05252" }}>
                                          {item.grade.correct ? "○" : "×"}
                                        </td>
                                        <td className="py-1 px-4" style={{ color: "var(--text-primary)" }}>{item.question}</td>
                                        <td className="py-1 pl-4" style={{ color: "var(--text-primary)" }}>{item.answer}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {expandedDetail && !isQuizDetail(expandedDetail) && (
                            <div className="space-y-3">
                              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                                全体平均: tone={expandedDetail.aggregate.judge.toneConsistency.toFixed(2)} knowledge=
                                {expandedDetail.aggregate.judge.knowledgeUse.toFixed(2)} persona=
                                {expandedDetail.aggregate.judge.personaMaintenance.toFixed(2)} natural=
                                {expandedDetail.aggregate.judge.naturalness.toFixed(2)}
                                {typeof expandedDetail.aggregate.referenceFidelity === "number" &&
                                  ` refFidelity=${expandedDetail.aggregate.referenceFidelity.toFixed(2)}`}
                                {expandedDetail.aggregate.judgeFailedCount > 0 &&
                                  ` （judge失敗 ${expandedDetail.aggregate.judgeFailedCount} 件）`}
                              </p>
                              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                ドリフト late: {formatRateSet(expandedDetail.aggregate.drift.late)} / delta:{" "}
                                {formatRateSet(expandedDetail.aggregate.drift.delta)}
                              </p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                      <th className="text-left py-1 pr-4" style={{ color: "var(--text-secondary)" }}>シナリオ</th>
                                      <th className="text-left py-1 px-4" style={{ color: "var(--text-secondary)" }}>軸</th>
                                      <th className="text-right py-1 px-4" style={{ color: "var(--text-secondary)" }}>ターン</th>
                                      <th className="text-right py-1 px-4" style={{ color: "var(--text-secondary)" }}>tone</th>
                                      <th className="text-right py-1 px-4" style={{ color: "var(--text-secondary)" }}>knowledge</th>
                                      <th className="text-right py-1 px-4" style={{ color: "var(--text-secondary)" }}>persona</th>
                                      <th className="text-right py-1 px-4" style={{ color: "var(--text-secondary)" }}>natural</th>
                                      <th className="text-right py-1 pl-4" style={{ color: "var(--text-secondary)" }}>refFidelity</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedDetail.scenarios.map((s) => (
                                      <tr key={s.scenarioId} style={{ borderBottom: "1px solid var(--border)" }}>
                                        <td className="py-1 pr-4" style={{ color: "var(--text-primary)" }}>{s.scenarioId}</td>
                                        <td className="py-1 px-4" style={{ color: "var(--text-primary)" }}>{s.axis}</td>
                                        <td className="text-right py-1 px-4" style={{ color: "var(--text-primary)" }}>{s.turns}</td>
                                        {s.judge.failed ? (
                                          <td colSpan={5} className="text-right py-1 px-4" style={{ color: "#e05252" }}>
                                            judge失敗
                                          </td>
                                        ) : (
                                          <>
                                            <td className="text-right py-1 px-4" style={{ color: "var(--text-primary)" }}>{s.judge.toneConsistency}</td>
                                            <td className="text-right py-1 px-4" style={{ color: "var(--text-primary)" }}>{s.judge.knowledgeUse}</td>
                                            <td className="text-right py-1 px-4" style={{ color: "var(--text-primary)" }}>{s.judge.personaMaintenance}</td>
                                            <td className="text-right py-1 px-4" style={{ color: "var(--text-primary)" }}>{s.judge.naturalness}</td>
                                            <td className="text-right py-1 pl-4" style={{ color: "var(--text-primary)" }}>
                                              {typeof s.judge.referenceFidelity === "number" ? s.judge.referenceFidelity : "-"}
                                            </td>
                                          </>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
