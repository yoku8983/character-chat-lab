# 品質回帰チェック（Issue #34 T2）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 評価レポートをベースラインとして固定し、改修後に GUI ワンボタン（または CLI `--check`）で同一構成の評価を再実行して PASS/FAIL 判定を出す仕組みを作る。

**Architecture:** 判定は純粋関数 `checkRegression`（`scripts/eval/regression.ts`）に集約し、CLI（`eval:compare --check`）と GUI（`/eval` の回帰チェックセクション + 新 API route）の両方が同じ関数を使う。ベースラインは `eval/baselines/<personaId>.json`（gitignore、ペルソナごと 1 スロット上書き）。評価ジョブ実行は既存 `app/api/eval/run/route.ts` の `runJob` を `lib/eval-ui/run-eval-job.ts` に抽出して check route と共用する。

**Tech Stack:** Next.js App Router (TypeScript strict), tsx ワンオフ検証（テストフレームワーク無し）, 既存 `scripts/eval/` 基盤。

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-07-04-eval-regression-tracking-design.md`（本計画の正）
- 判定既定値: Judge 各観点（口調一貫性・知識活用度・人格維持・自然さ）と referenceFidelity は基準から **0.5 以上の下落で FAIL**。口調マーカー（一人称・語尾）の late 出現率は **15 パーセントポイント（rate 値で 0.15）以上の下落で FAIL**。下落 = `baseline - current`、`下落 >= 閾値` で FAIL（境界値ちょうどは FAIL）
- 比較対象は eval レポートのみ（quiz レポートはベースライン設定不可。日本語 400 エラー）
- referenceFidelity は**両レポートの aggregate に存在する場合のみ**判定対象。片方欠落時は判定せず `skipped` として報告
- 全 API route は既存 `isEvalUiEnabled()` ガード（無効時 404）を適用
- エラーメッセージ・UI 文言はすべて日本語
- `--check` なしの `eval:compare`、既存 `eval` / `eval:quiz` / GUI の既存機能は後方互換（挙動不変）
- スタイリング: 既存 `EvalConsole.tsx` の規約に従う（レイアウトは Tailwind クラス、色は `style` 属性の CSS 変数 `var(--text-primary)` 等。エラー色 `#e05252`・成功色 `#4caf50` は既存ハードコードに合わせる）
- テストフレームワークは無い。純粋関数は tsx ワンオフスクリプト（スクラッチパッドに置き、**コミットしない**）で検証。API は dev サーバー + curl、GUI は実 API での e2e（縮小構成・少額コスト可）
- `npx next build` の前に dev サーバーを必ず停止。build 後に dev を再開する場合は `rm -rf .next` してから
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: 判定純粋関数 `scripts/eval/regression.ts`

**Files:**
- Create: `scripts/eval/regression.ts`
- 検証: tsx ワンオフ（スクラッチパッド、コミットしない）

**Interfaces:**
- Consumes: `EvalReport`（`scripts/eval/report.ts`）。`aggregate.judge` は `JudgeScores`（フィールド: `toneConsistency` / `knowledgeUse` / `personaMaintenance` / `naturalness`、各 1〜5）。`aggregate.referenceFidelity?: number`。`aggregate.drift: DriftStats`（`late: RateSet`、`RateSet` = `{ firstPerson: number; sentenceEnding: number; catchphrase: number }`、値は 0〜1 の割合）
- Produces: 後続タスクが使う以下の export
  - `interface RegressionThresholds { judgeDrop: number; markerDropRate: number }`
  - `const DEFAULT_THRESHOLDS: RegressionThresholds`（`{ judgeDrop: 0.5, markerDropRate: 0.15 }`）
  - `interface RegressionFinding { metric: string; kind: "judge" | "marker"; baseline: number; current: number; delta: number; failed: boolean }`（`delta = current - baseline`）
  - `interface RegressionResult { pass: boolean; findings: RegressionFinding[]; skipped: string[] }`
  - `function checkRegression(baseline: EvalReport, current: EvalReport, thresholds?: RegressionThresholds): RegressionResult`

- [ ] **Step 1: 実装**

```ts
// scripts/eval/regression.ts
// 品質回帰の合否判定。CLI (compare.ts --check) と GUI (API route) の両方が
// この関数を使うことで判定基準のズレを防ぐ。
import { EvalReport } from "./report";

export interface RegressionThresholds {
  /** Judge 観点(1〜5)の下落許容量。これ以上下がったら FAIL */
  judgeDrop: number;
  /** マーカー late 出現率(0〜1)の下落許容量。0.15 = 15 パーセントポイント */
  markerDropRate: number;
}

export const DEFAULT_THRESHOLDS: RegressionThresholds = {
  judgeDrop: 0.5,
  markerDropRate: 0.15,
};

export interface RegressionFinding {
  metric: string;
  kind: "judge" | "marker";
  baseline: number;
  current: number;
  /** current - baseline（負なら下落） */
  delta: number;
  failed: boolean;
}

export interface RegressionResult {
  pass: boolean;
  findings: RegressionFinding[];
  /** 判定できず飛ばした観点（片方のレポートに無い等）の説明 */
  skipped: string[];
}

function judgeFinding(
  metric: string,
  baseline: number,
  current: number,
  threshold: number
): RegressionFinding {
  const delta = current - baseline;
  return { metric, kind: "judge", baseline, current, delta, failed: baseline - current >= threshold };
}

function markerFinding(
  metric: string,
  baseline: number,
  current: number,
  threshold: number
): RegressionFinding {
  const delta = current - baseline;
  return { metric, kind: "marker", baseline, current, delta, failed: baseline - current >= threshold };
}

export function checkRegression(
  baseline: EvalReport,
  current: EvalReport,
  thresholds: RegressionThresholds = DEFAULT_THRESHOLDS
): RegressionResult {
  const findings: RegressionFinding[] = [];
  const skipped: string[] = [];

  const bj = baseline.aggregate.judge;
  const cj = current.aggregate.judge;
  findings.push(judgeFinding("口調一貫性", bj.toneConsistency, cj.toneConsistency, thresholds.judgeDrop));
  findings.push(judgeFinding("知識活用度", bj.knowledgeUse, cj.knowledgeUse, thresholds.judgeDrop));
  findings.push(judgeFinding("人格維持", bj.personaMaintenance, cj.personaMaintenance, thresholds.judgeDrop));
  findings.push(judgeFinding("自然さ", bj.naturalness, cj.naturalness, thresholds.judgeDrop));

  const bRef = baseline.aggregate.referenceFidelity;
  const cRef = current.aggregate.referenceFidelity;
  if (typeof bRef === "number" && typeof cRef === "number") {
    findings.push(judgeFinding("参照忠実度", bRef, cRef, thresholds.judgeDrop));
  } else if (typeof bRef === "number" || typeof cRef === "number") {
    skipped.push("参照忠実度: 片方のレポートにしか無いため判定をスキップしました");
  }

  const bLate = baseline.aggregate.drift.late;
  const cLate = current.aggregate.drift.late;
  findings.push(markerFinding("一人称 late 出現率", bLate.firstPerson, cLate.firstPerson, thresholds.markerDropRate));
  findings.push(markerFinding("語尾 late 出現率", bLate.sentenceEnding, cLate.sentenceEnding, thresholds.markerDropRate));

  return { pass: findings.every((f) => !f.failed), findings, skipped };
}
```

- [ ] **Step 2: tsx ワンオフで検証**

スクラッチパッドに検証スクリプトを書き、`EvalReport` 形のダミーオブジェクト（`meta`・`scenarios` は最小限でよい。`aggregate` が本体）で以下を確認して結果を出力する:

1. 全観点同値 → `pass: true`、findings 6 件（referenceFidelity なし）、skipped 0 件
2. toneConsistency が 5.0 → 4.5（下落ちょうど 0.5） → その finding のみ `failed: true`、`pass: false`
3. toneConsistency が 5.0 → 4.6（下落 0.4） → `pass: true`
4. 一人称 late 0.80 → 0.65（下落ちょうど 0.15） → FAIL / 0.80 → 0.70（0.10） → PASS
5. referenceFidelity 両方あり 4.8 → 4.2 → findings 7 件・FAIL / baseline のみあり → skipped 1 件・findings 6 件
6. 改善方向（current > baseline） → `failed: false`、`delta` が正
7. カスタム閾値 `{ judgeDrop: 1.0, markerDropRate: 0.3 }` で 2 の下落 0.5 が PASS になる

Run: `npx tsx <スクラッチパッド>/verify-regression.ts`
Expected: 全ケース OK 表示

- [ ] **Step 3: 型チェックとコミット**

Run: `npx tsc --noEmit`
Expected: エラーなし

```bash
git add scripts/eval/regression.ts
git commit -m "feat: 回帰判定の純粋関数 checkRegression を追加 (Issue #34 T2)"
```

---

### Task 2: CLI `eval:compare --check`

**Files:**
- Modify: `scripts/eval/compare.ts`（`main()` の引数パース部と末尾）

**Interfaces:**
- Consumes: Task 1 の `checkRegression` / `DEFAULT_THRESHOLDS` / `RegressionResult`
- Produces: CLI 挙動のみ（`--check` で判定テーブル出力、FAIL 時 exit code 1）

- [ ] **Step 1: 引数パースと判定出力を追加**

`compare.ts` の `main()` を次の方針で改修（既存の比較表示ロジック・ヘルパーは無変更）:

```ts
function main(): void {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const [beforePath, afterPath] = positional;

  if (!beforePath || !afterPath) {
    console.error(
      "使い方: npm run eval:compare -- <before.json> <after.json> [--check] [--judge-threshold 0.5] [--marker-threshold 15]"
    );
    process.exit(1);
  }

  const check = args.includes("--check");
  const judgeThreshold = readNumberOption(args, "--judge-threshold") ?? DEFAULT_THRESHOLDS.judgeDrop;
  const markerThresholdPt = readNumberOption(args, "--marker-threshold");
  const markerThreshold =
    markerThresholdPt !== null ? markerThresholdPt / 100 : DEFAULT_THRESHOLDS.markerDropRate;

  // ...既存の loadReport・差分表示はそのまま実行...

  if (check) {
    const result = checkRegression(before, after, {
      judgeDrop: judgeThreshold,
      markerDropRate: markerThreshold,
    });
    printCheckResult(result);
    process.exit(result.pass ? 0 : 1);
  }
}
```

`readNumberOption(args, name)`: `--judge-threshold 0.5` 形式（次の引数が値）をパースし、無ければ `null`、値が数値でなければ日本語エラーで `process.exit(1)`。

また `--check` 時、2 レポートの `meta.persona` または `meta.model` が異なる場合は判定前に警告を 1 行出す（中断はしない。意図的な構成変更の比較を妨げないため）: `⚠️ 構成が異なります（persona/model）。同一構成での比較を推奨します`

`printCheckResult(result)`: 以下を出力する:
- 観点ごとの行: 観点名 / 基準値 / 今回値 / 差分 / `OK` or `FAIL`（`console.table` 可。marker 系は `(値*100).toFixed(0) + "%"` 表示、judge 系は `toFixed(2)`）
- `skipped` があれば各行を `（スキップ）` として表示
- 最後に `✅ 回帰チェック PASS` または `❌ 回帰チェック FAIL（N 観点が閾値超の下落）`

- [ ] **Step 2: 動作確認**

Task 1 の検証で使ったダミーレポート 2 枚を一時ファイルに JSON 保存し（スクラッチパッド。コミットしない）:

Run: `npm run eval:compare -- <base.json> <same.json> --check; echo "exit=$?"`
Expected: 全観点 OK、`PASS`、`exit=0`

Run: `npm run eval:compare -- <base.json> <degraded.json> --check; echo "exit=$?"`
Expected: 下落観点が FAIL 表示、`exit=1`

Run: `npm run eval:compare -- <base.json> <degraded.json> --check --judge-threshold 2 --marker-threshold 50; echo "exit=$?"`
Expected: `PASS`、`exit=0`（閾値緩和が効く）

Run: `npm run eval:compare -- <base.json> <same.json>; echo "exit=$?"`
Expected: 従来どおり差分表のみ・判定なし・`exit=0`（後方互換）

- [ ] **Step 3: 型チェックとコミット**

Run: `npx tsc --noEmit`

```bash
git add scripts/eval/compare.ts
git commit -m "feat: eval:compare に --check フラグ(閾値判定・FAILでexit 1)を追加"
```

---

### Task 3: ベースライン保存 `lib/eval-ui/baseline.ts` + API route + .gitignore

**Files:**
- Create: `lib/eval-ui/baseline.ts`
- Create: `app/api/eval/baseline/route.ts`
- Modify: `.gitignore`（`eval/reports/` の近くに追記）

**Interfaces:**
- Consumes: `EvalReport` / `REPORTS_DIR` / `sanitizeForFilename`（`scripts/eval/report.ts`）、`isEvalUiEnabled`（`lib/eval-ui/guard.ts`）
- Produces:
  - `const BASELINES_DIR: string`（`path.join(process.cwd(), "eval", "baselines")`）
  - `function saveBaseline(report: EvalReport): string`（保存先パスを返す。ファイル名 `sanitizeForFilename(report.meta.persona) + ".json"`、ディレクトリは `fs.mkdirSync(..., { recursive: true })`）
  - `function loadBaseline(personaId: string): EvalReport | null`（無ければ null。`personaId` は保存時と同じ `sanitizeForFilename` を通してファイル名化）
  - `interface BaselineListItem { personaId: string; createdAt: string; model: string; scenariosCount: number; maxTurns: number; judgeAvg: number; referenceFidelity: number | null; datasetPath: string | null }`
  - `function listBaselines(): BaselineListItem[]`（ディレクトリ未存在は空配列。パース失敗ファイルはスキップ）
  - API: `GET /api/eval/baseline` → `BaselineListItem[]`、`POST /api/eval/baseline` body `{ filename: string }` → 200 `{ personaId }`

- [ ] **Step 1: `lib/eval-ui/baseline.ts` 実装**

`BaselineListItem` の導出:
- `personaId` = `report.meta.persona`
- `scenariosCount` = `report.scenarios.length`
- `maxTurns` = `Math.max(...report.scenarios.map((s) => s.turns))`（構成復元用。ターン数はシナリオごとに `turns` として記録済み）
- `judgeAvg` = judge 4観点の平均
- `referenceFidelity` = `report.aggregate.referenceFidelity ?? null`
- `datasetPath` = `report.meta.dataset?.path ?? null`

- [ ] **Step 2: `app/api/eval/baseline/route.ts` 実装**

既存 route の流儀（`isEvalUiEnabled()` で 404、日本語エラー、`Response.json`）に従う。

POST の処理順:
1. guard → 404
2. body JSON パース失敗 / `filename` 非文字列 → 400 「filename を指定してください」
3. filename 検証は `app/api/eval/reports/[filename]/route.ts` と同一: `/[^a-zA-Z0-9._-]/.test(filename) || filename === "." || filename === ".."` → 400 「ファイル名が不正です」
4. `filename.startsWith("quiz-")` → 400 「クイズレポートはベースラインに設定できません（多ターン評価のレポートを選んでください）」
5. `REPORTS_DIR` 内の該当ファイルを読み `EvalReport` としてパース。存在しない → 404。`aggregate.judge` や `aggregate.drift` が欠けている → 400 「このレポートはベースラインに使えません（形式が古い可能性があります）」
6. `saveBaseline(report)` → 200 `{ personaId: report.meta.persona }`

GET: guard → `Response.json(listBaselines())`

- [ ] **Step 3: `.gitignore` に追記**

```
# eval baselines (実キャラのレポートが入るため追跡しない)
eval/baselines/
```

- [ ] **Step 4: 動作確認（dev サーバー + curl）**

`EVAL_UI_ENABLED=1 npm run dev` で起動し（既に起動していれば再利用）:

- 既存レポートが無ければ tsx ワンオフで Task 1 のダミー `EvalReport` を `eval/reports/test-baseline-check.json` に書いてから:
- `curl -s -X POST localhost:3000/api/eval/baseline -H 'Content-Type: application/json' -d '{"filename":"test-baseline-check.json"}'` → 200、`eval/baselines/<personaId>.json` が生成される
- `curl -s localhost:3000/api/eval/baseline` → 一覧に 1 件、`scenariosCount`/`maxTurns`/`judgeAvg` が期待値
- `curl -s -X POST ... -d '{"filename":"../secret"}'` → 400
- `curl -s -X POST ... -d '{"filename":"quiz-x.json"}'` → 400（クイズ拒否）
- `EVAL_UI_ENABLED` なしで起動し直して GET → 404
- 確認後、テスト用に作った `eval/reports/test-baseline-check.json`・`eval/baselines/` 配下を削除し、`git status` がクリーンであること（gitignore が効いている）を確認

- [ ] **Step 5: 型チェックとコミット**

Run: `npx tsc --noEmit`

```bash
git add lib/eval-ui/baseline.ts app/api/eval/baseline/route.ts .gitignore
git commit -m "feat: 評価ベースラインの保存・一覧API(/api/eval/baseline)を追加"
```

---

### Task 4: ジョブ実行の共通化 + 回帰チェック API `/api/eval/check`

**Files:**
- Create: `lib/eval-ui/run-eval-job.ts`（`app/api/eval/run/route.ts` から `resolvePersona`・`runJob` を移設・拡張）
- Create: `app/api/eval/check/route.ts`
- Modify: `app/api/eval/run/route.ts`（移設した関数を import に置換。`validateParams`・`POST` は残す）
- Modify: `lib/eval-ui/job-store.ts`（回帰結果フィールド追加）

**Interfaces:**
- Consumes: Task 1 `checkRegression`/`RegressionResult`、Task 3 `loadBaseline`、既存 `runEval`(`EvalConfig`)・`runQuiz`・`writeReport`・`writeQuizReport`・job-store 各関数
- Produces:
  - `EvalJobState` に `regression: RegressionResult | null` を追加（既定 null）。`EvalJobParams` に `check?: boolean` を追加
  - `finishJob(id, result)` の `result` に `regression?: RegressionResult` を追加（渡されたときのみセット）
  - `lib/eval-ui/run-eval-job.ts`:
    - `function resolvePersona(params: { personaId?: string; personaFile?: string }): Promise<Persona>`（run route の現行実装を移設）
    - `function runJob(jobId: string, params: EvalJobParams, apiKey: string, baseline?: EvalReport): Promise<void>`（run route の現行 `runJob` を移設。eval 分岐の末尾で `baseline` があれば `checkRegression(baseline, report)` を計算し `finishJob(jobId, { status, reportPath, regression })` に渡す。quiz 分岐は不変）
  - API: `POST /api/eval/check` body `{ personaId: string, personaFile?: string }` → 202 `{ jobId }`

- [ ] **Step 1: job-store 拡張**

`EvalJobState` に `regression: RegressionResult | null;` を追加（`import type { RegressionResult } from "@/scripts/eval/regression"` — パスエイリアスが scripts に効かない場合は相対 import）。`tryStartJob` での初期値は `null`。`finishJob` は `result.regression` があればセット。`EvalJobParams` に `check?: boolean` を追加。既存呼び出し側の変更は不要（optional のため）。

- [ ] **Step 2: `run-eval-job.ts` へ移設・拡張**

`app/api/eval/run/route.ts` から `resolvePersona`・`runJob`（と両者だけが使う import）を **そのまま** `lib/eval-ui/run-eval-job.ts` に移し、`runJob` に第4引数 `baseline?: EvalReport` を追加。eval 分岐の `finishJob` 呼び出しを:

```ts
const filePath = writeReport(report);
const regression = baseline ? checkRegression(baseline, report) : undefined;
finishJob(jobId, { status: cancelled ? "cancelled" : "done", reportPath: filePath, regression });
```

run route 側は import に差し替え、`void runJob(job.id, params, apiKey)` の呼び方は不変（baseline なし）。

- [ ] **Step 3: `app/api/eval/check/route.ts` 実装**

POST の処理順（すべて日本語エラー）:
1. guard → 404
2. `OPENROUTER_API_KEY` 未設定 → 400（run route と同文言）
3. body パース、`personaId` 非文字列/空 → 400 「personaId を指定してください」
4. `loadBaseline(personaId)` が null → 404 「このペルソナのベースラインがありません。先に評価を実行し、結果をベースラインに設定してください」
5. ベースラインから構成復元: `model = meta.model`、`temperature = meta.temperature`、`scenariosCount = scenarios.length`、`maxTurns = Math.max(...scenarios.map(s => s.turns))`、`datasetPath = meta.dataset?.path ?? undefined`
6. `datasetPath` があるのにファイルが存在しない → 400 「ベースラインのデータセット <path> が見つかりません。パスを確認するか、ベースラインを取り直してください」
7. ペルソナ解決: body の `personaFile` があればそれを、なければ `personaId` を使う `EvalJobParams` を組む。DB に居るかは `runJob` 内の既存 `resolvePersona` が判定して失敗時 failed になるが、**起動前に**軽く検証したいので `resolvePersona` をここでも try し、失敗 → 400 「ペルソナ <personaId> が DB にありません。ファイルベースのペルソナは personaFile を指定してください」
8. `tryStartJob({ kind: "eval", personaId(または personaFile), datasetPath, model, temperature, scenariosCount, maxTurns, check: true })` → null なら 409 「別の評価が実行中です」
9. `void runJob(job.id, params, apiKey, baseline)` → 202 `{ jobId: job.id }`

- [ ] **Step 4: 動作確認（curl・実 API 消費なしの範囲）**

`EVAL_UI_ENABLED=1 npm run dev` で:
- ベースライン未設定の personaId で POST /api/eval/check → 404 と誘導文言
- `personaId` 欠落 → 400
- ガード無効時 → 404
- （実行系の e2e は Task 7 でまとめて行う）

- [ ] **Step 5: 既存機能の回帰確認・型チェック・コミット**

- GUI から通常評価を 1 件実行できること（Task 7 の e2e で兼ねる場合は、この時点では `npx tsc --noEmit` と `POST /api/eval/run` のバリデーション系 curl（400/409 系）だけ確認）

```bash
git add lib/eval-ui/run-eval-job.ts lib/eval-ui/job-store.ts app/api/eval/run/route.ts app/api/eval/check/route.ts
git commit -m "feat: 回帰チェックAPI(/api/eval/check)とジョブ実行の共通化"
```

---### Task 5: GUI — ベースライン設定 + 回帰チェックセクション（`EvalConsole.tsx`）

**Files:**
- Modify: `components/EvalConsole.tsx`

**Interfaces:**
- Consumes: Task 3/4 の API（`GET/POST /api/eval/baseline`、`POST /api/eval/check`）。`EvalJobState.regression`（`RegressionResult` 形。コンポーネント内の型は既存流儀に合わせてローカル再定義でよい: `{ pass: boolean; findings: { metric: string; kind: "judge" | "marker"; baseline: number; current: number; delta: number; failed: boolean }[]; skipped: string[] }`）
- Produces: UI のみ

- [ ] **Step 1: state と fetch を追加**

- `baselines: BaselineItem[]`（ローカル型 `{ personaId, createdAt, model, scenariosCount, maxTurns, judgeAvg, referenceFidelity, datasetPath }`）、`baselineError: string | null`、`checkPersonaFile: string`（任意入力）、`checkError: string | null`
- `fetchBaselines = useCallback(async () => { fetch("/api/eval/baseline") ... })`。初回 `useEffect` と、ベースライン設定成功後・ジョブ完了後（既存 `fetchStatus` 内で `fetchReports` を呼んでいる箇所）に再取得

- [ ] **Step 2: 回帰チェックセクションを実行フォームの上に追加**

既存の `sectionStyle` を使う `<section>`。内容:
- 見出し「回帰チェック」と 1 行の説明「ベースラインと同じ構成で評価を再実行し、品質が落ちていないか判定します。」
- `baselines` が空: 「まだベースラインがありません。下のフォームで評価を実行し、実行履歴の行から「ベースラインに設定」を押してください。」
- ベースラインごとの行: ペルソナ / 取得日時 / モデル / 構成（`シナリオ{scenariosCount}×{maxTurns}ターン`）/ judge 平均 / 推定 API コール数（`scenariosCount * maxTurns + scenariosCount` 回。既存フォームの目安表示と同じ文言様式）/ 「回帰チェック実行」ボタン
- ボタンは `job?.status === "running"` 中は disabled。クリックで `POST /api/eval/check` に `{ personaId, personaFile: checkPersonaFile || undefined }` を送り、202 なら `fetchStatus()` を呼んでから既存 `startPolling()`（既存 `handleSubmit` と同じ流れ）。エラー時は response の `error` を `checkError` に表示
- ペルソナが DB に無い場合向けの折りたたみ的な小さな入力: 「ファイルベースのペルソナの場合のみ: ペルソナ JSON パス」テキスト入力（`checkPersonaFile`）

- [ ] **Step 3: 回帰チェック結果の表示**

ジョブ表示部（既存の進捗・結果エリアの近く）に、`job` が `params.check` かつ `status` が `done`/`cancelled`/`failed` を終えたとき:
- `job.regression` があれば: PASS バッジ（`#4caf50`）/ FAIL バッジ（`#e05252`）+ テーブル（観点 / 基準値 / 今回値 / 差分 / 判定）。judge 系は `toFixed(2)`、marker 系は `(v*100).toFixed(0)%` 表示。`failed` 行は行ごと `#e05252` 文字色。`skipped` は表の下に小さく表示
- `status === "cancelled"` で regression が無い場合: 「中断されたため判定していません」

- [ ] **Step 4: 実行履歴の行に「ベースラインに設定」ボタン**

- eval 種別（`r.kind === "eval"`）の行のみ表示。`<td>` を 1 列追加（テーブルヘッダも +1 列、詳細展開行の `colSpan` を 7→8 に更新）
- クリック時: 同じ `persona` のベースラインが既にあれば `window.confirm("<persona> のベースラインを上書きします。よろしいですか？")`。OK なら `POST /api/eval/baseline { filename }` → 成功で `fetchBaselines()`、失敗はエラー文言表示（`baselineError`）
- 行クリック（詳細展開）とボタンクリックが干渉しないよう、ボタンの onClick で `e.stopPropagation()`

- [ ] **Step 5: 型チェック・目視確認・コミット**

Run: `npx tsc --noEmit`
`EVAL_UI_ENABLED=1 npm run dev` で `/eval` を開き、回帰チェックセクション・履歴のボタン・ベースライン未設定時の誘導文言をブラウザ（または curl で HTML/挙動）確認。実 API を使う e2e は Task 7。

```bash
git add components/EvalConsole.tsx
git commit -m "feat: 評価GUIにベースライン設定と回帰チェック(ワンボタン実行・PASS/FAIL表示)を追加"
```

---

### Task 6: ヘッダーに「評価」リンク（RSC 化した page.tsx からフラグを渡す）

**Files:**
- Create: `components/HomeClient.tsx`（現 `app/page.tsx` の中身を移設）
- Modify: `app/page.tsx`（RSC ラッパーに置換）
- Modify: `components/Header.tsx`

**Interfaces:**
- Consumes: `isEvalUiEnabled()`（`lib/eval-ui/guard.ts`）
- Produces: `HomeClient` の props `{ evalUiEnabled: boolean }`、`HeaderProps` に `evalUiEnabled?: boolean` 追加

- [ ] **Step 1: `app/page.tsx` の中身を `components/HomeClient.tsx` へ移設**

- 現 `app/page.tsx`（210 行、`"use client"`）を**内容そのまま** `components/HomeClient.tsx` にコピーし、`export default function Home()` を `export default function HomeClient({ evalUiEnabled }: { evalUiEnabled: boolean })` に変更。`<Header ...>` に `evalUiEnabled={evalUiEnabled}` を追加。それ以外のロジックは一切変更しない
- 新 `app/page.tsx`:

```tsx
import HomeClient from "@/components/HomeClient";
import { isEvalUiEnabled } from "@/lib/eval-ui/guard";

export const dynamic = "force-dynamic";

export default function Page() {
  return <HomeClient evalUiEnabled={isEvalUiEnabled()} />;
}
```

- [ ] **Step 2: `Header.tsx` に「評価」リンク**

- `HeaderProps` に `evalUiEnabled?: boolean` を追加
- 既存の「利用状況」リンク（`/usage`）の**隣**に、`evalUiEnabled` が true のときのみ `<Link href="/eval">評価</Link>` を表示。デスクトップ・モバイル両方（「利用状況」が出ている場所すべてに同じ条件で並べる）。スタイルは既存「利用状況」リンクと同一クラス・同一 style をコピー

- [ ] **Step 3: 確認・コミット**

- `EVAL_UI_ENABLED=1 npm run dev`: ヘッダーに「評価」が出て `/eval` に遷移できる（デスクトップ幅・モバイル幅両方）
- `EVAL_UI_ENABLED` なし: 「評価」リンクが出ない。チャット・変換・ペルソナ管理・セッションサイドバー・記憶パネルが従来どおり動く（移設の回帰確認。チャット 1 往復まで確認）
- Run: `npx tsc --noEmit`

```bash
git add app/page.tsx components/HomeClient.tsx components/Header.tsx
git commit -m "feat: ヘッダーに評価コンソールへのリンクを追加(EVAL_UI_ENABLED時のみ)"
```

---

### Task 7: ドキュメント + e2e + ビルド確認

**Files:**
- Modify: `scripts/eval/README.md`（「品質回帰チェックの運用」章を新設）
- Modify: `README.md`（`/eval` の説明に回帰チェック・ヘッダー導線を追記）
- Modify: `PROGRESS.md`（完了メモ）

**Interfaces:** なし（ドキュメントと検証）

- [ ] **Step 1: `scripts/eval/README.md` に運用ガイド**

「品質回帰チェックの運用」章を新設し、**この順で**書く（コマンドを覚えていない人間が読者。GUI 手順が主、CLI は補足):

1. **いつやるか**: `lib/prompt.ts`（プロンプト構築）・ペルソナ定義（YAML/DB/本番 JSON）・モデル/temperature 設定を変更したとき
2. **初回（ベースラインを作る）**: ①`EVAL_UI_ENABLED=1 npm run dev` で起動 → ②ヘッダー「評価」→ ③フォームから評価を実行（構成の目安も記載: フル 10×16 で約 $0.04、縮小 3×8 なら数円未満）→ ④実行履歴の行の「ベースラインに設定」を押す
3. **改修後（チェックする）**: ①評価コンソールを開く → ②「回帰チェック」セクションの「回帰チェック実行」を押す → ③PASS/FAIL と観点別テーブルを見る
4. **FAIL が出たら**: どの観点が下がったかテーブルで確認。意図しない劣化なら改修を見直す。意図的な品質変更（プロンプト改善等で挙動が変わるのが正しい場合）なら、新しいレポートを「ベースラインに設定」で基準を更新する
5. **判定基準**: Judge 各観点・参照忠実度は −0.5、口調マーカー late 出現率は −15pt の下落で FAIL（境界値ちょうどは FAIL）
6. **CLI（補足）**: `npm run eval:compare -- <baseline.json> <new.json> --check [--judge-threshold 0.5] [--marker-threshold 15]`。FAIL で exit 1。ベースライン JSON は `eval/baselines/<personaId>.json`
7. 注意: ベースラインは `eval/baselines/` にローカル保存（git 追跡外）。マシンを移行したら取り直す

- [ ] **Step 2: ルート `README.md` 追記**

`/eval` の既存説明に 1 段落: ベースライン設定と回帰チェック（ワンボタンで基準構成の再評価 + PASS/FAIL 判定）ができること、ヘッダー「評価」リンクから遷移できること。

- [ ] **Step 3: e2e（実 API・縮小構成・少額）**

`EVAL_UI_ENABLED=1 npm run dev` で `/eval` から:
1. サンプルペルソナ（tetsu-oyaji）で評価を実行（シナリオ 1×2 ターン程度。$0.001 未満）
2. 完了したレポートを「ベースラインに設定」
3. 「回帰チェック実行」→ 同一構成で走り、完了後に PASS バッジと観点別テーブルが出る（同一条件なので通常 PASS。judge のゆらぎで FAIL でも表示自体が正しければ OK とし、結果を記録）
4. 実行中にもう一度実行 → 409 の文言が UI に出る（タイミングが難しければ curl で代替）
5. 中断ボタン → cancelled 表示、「中断されたため判定していません」
6. CLI: 生成された 2 枚のレポートで `eval:compare --check` が動く
7. 後始末: e2e で作ったレポート・ベースラインを削除し `git status` クリーン確認

- [ ] **Step 4: ビルド確認**

dev サーバーを**停止してから**:
Run: `npx next build`
Expected: 成功
その後 `rm -rf .next`（dev 再開に備える）
Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 5: PROGRESS.md 更新とコミット**

`PROGRESS.md` の「完了済み（直近）」に本タスクの完了メモ（実装内容・判定基準・e2e 結果・コスト実測）を追記し、「次にやること」の T2 表記を完了扱いに更新。

```bash
git add scripts/eval/README.md README.md PROGRESS.md
git commit -m "docs: 品質回帰チェックの運用ガイドを追記、PROGRESS更新 (Issue #34 T2)"
```

---

## 計画外だが同 PR 完了後にやること（コントローラー向けメモ・タスクではない）

- PR 作成（ユーザー承認後マージ）
- Issue #34 の T2 チェックボックス更新 + 「GitHub Actions 化」「本番会話サンプリング採点」見送りの判断理由コメント（設計書の「スコープ判断」を要約）
