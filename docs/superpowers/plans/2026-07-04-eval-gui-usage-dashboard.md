# 評価 GUI + usage ダッシュボード強化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** usage ページに日次/月次集計・円換算・ナビ導線を追加し(PR①)、評価ハーネスをローカル専用のブラウザ GUI から実行できるようにする(PR②)。

**Architecture:** 設計書 `docs/superpowers/specs/2026-07-04-eval-gui-usage-dashboard-design.md` 参照。PR① は `lib/db-usage-log.ts` の集計拡張 + RSC ページ改修。PR② は `EVAL_UI_ENABLED` ガード付きの `/eval` ページ + `app/api/eval/*` から `scripts/eval/harness.ts` を同一プロセス import で実行(メモリ上の単一ジョブ)。

**Tech Stack:** Next.js App Router (TS strict) / Tailwind + CSS 変数 / libSQL / 既存 eval ハーネス(`scripts/eval/`)

## Global Constraints

- TypeScript strict mode。`npx tsc --noEmit` が全タスク完了時にパスすること
- テストフレームワーク無し。純粋関数は tsx ワンオフスクリプト(スクラッチパッド置き・**コミット禁止**)で assert 検証、UI は dev サーバーで手動確認
- ビルド検証前に dev サーバー停止(プロジェクト CLAUDE.md)。この計画では `tsc --noEmit` を基本とし `next build` は最終確認のみ
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- main 直 push 禁止。PR① = ブランチ `feat/usage-dashboard`、PR② = ブランチ `feat/eval-gui`(PR① マージ後に main から分岐)
- `eval/reports/` の生成物・スクラッチパッドの検証スクリプトはコミットしない
- UI 文言は日本語。スタイリングは既存の Tailwind クラス + CSS 変数(`var(--bg-primary)` 等)方式に合わせる

---

## PR①: usage ダッシュボード強化(ブランチ `feat/usage-dashboard`)

### Task 1: 集計拡張(月次・今日・今月、JST 基準)

**Files:**
- Modify: `lib/db-usage-log.ts`
- Verify: tsx ワンオフ(インメモリ SQLite で usage_log を作りダミー行を投入して検証)

**Interfaces(Produces):**
```ts
export interface UsageByMonth { month: string; cost: number; calls: number } // month = "2026-07"
export interface UsagePeriodSummary { calls: number; cost: number } // 今日・今月用
export interface UsageSummary {
  byModel: UsageByModel[];
  byDay: UsageByDay[];        // 既存。ただし直近30日に制限 + JST 基準に変更
  byMonth: UsageByMonth[];    // 新規
  today: UsagePeriodSummary;  // 新規
  thisMonth: UsagePeriodSummary; // 新規
  overall: UsageOverall;      // 既存のまま
}
```

**設計判断(重要):** `created_at` は `datetime('now')`(UTC)で保存されている。日別・月別・今日・今月の境界は**日本時間(JST)基準**に統一する。SQLite の modifier で `date(created_at, '+9 hours')` / `strftime('%Y-%m', created_at, '+9 hours')` を使う。比較対象の「現在」も `date('now', '+9 hours')` / `strftime('%Y-%m', 'now', '+9 hours')`。既存 `byDay` の UTC 区切りからの変更になるが、日本で使う個人アプリのコストダッシュボードとして自然な区切りを優先する(PR 説明に明記)。

- [ ] **Step 1: `getUsageSummary` に以下のクエリを追加実装**

```sql
-- byMonth
SELECT strftime('%Y-%m', created_at, '+9 hours') AS month, SUM(cost) AS cost, COUNT(*) AS calls
FROM usage_log GROUP BY month ORDER BY month DESC
-- byDay(既存を JST 化 + 30日制限)
SELECT date(created_at, '+9 hours') AS day, SUM(cost) AS cost, COUNT(*) AS calls
FROM usage_log GROUP BY day ORDER BY day DESC LIMIT 30
-- today
SELECT COUNT(*) AS calls, SUM(cost) AS cost FROM usage_log
WHERE date(created_at, '+9 hours') = date('now', '+9 hours')
-- thisMonth
SELECT COUNT(*) AS calls, SUM(cost) AS cost FROM usage_log
WHERE strftime('%Y-%m', created_at, '+9 hours') = strftime('%Y-%m', 'now', '+9 hours')
```

行変換は既存の `rowToUsageByDay` パターンに倣い `rowToUsageByMonth`・`rowToPeriodSummary` を追加。`SUM(cost)` が NULL の場合は 0(既存の `Number(...) || 0` パターン)。

- [ ] **Step 2: tsx ワンオフで検証** — `@libsql/client` の `createClient({ url: "file::memory:" })` で usage_log テーブルを作成し、「今日(JST)」「先月」「UTC では前日だが JST では今日」の3行を投入。today.calls=2(JST 境界をまたぐ行が含まれる)、byMonth が2行、byDay 30日制限、を assert
- [ ] **Step 3: `npx tsc --noEmit` パス確認 → コミット**(`feat: usage 集計に月次・今日・今月(JST基準)を追加`)

### Task 2: 円換算ヘルパ

**Files:**
- Create: `lib/jpy.ts`
- Modify: `.env.example`

**Interfaces(Produces):**
```ts
export function getUsdJpyRate(): number; // env USD_JPY_RATE(正の有限数のみ有効)、無効/未設定なら 155
export function formatJpy(usd: number, rate: number): string; // "¥6.4"(1円未満は小数1桁、以上は整数の toLocaleString("ja-JP"))
export function formatUsd(usd: number): string; // "$0.0412"(toFixed(4))
```

- [ ] **Step 1: 実装**(`getUsdJpyRate` は `Number(process.env.USD_JPY_RATE)` が `> 0 && Number.isFinite` のときのみ採用)
- [ ] **Step 2: tsx ワンオフで検証**(未設定/不正値→155、`formatJpy(0.0412, 155)` → "¥6.4"、`formatJpy(1, 155)` → "¥155")
- [ ] **Step 3: `.env.example` に `USD_JPY_RATE=155` を注釈付きで追記 → tsc → コミット**

### Task 3: usage ページ改修 + ナビ導線

**Files:**
- Modify: `app/usage/page.tsx`
- Modify: `components/Header.tsx`

**Interfaces(Consumes):** Task 1 の `UsageSummary` 新フィールド、Task 2 の `getUsdJpyRate`/`formatJpy`/`formatUsd`

- [ ] **Step 1: `app/usage/page.tsx` を改修**
  - 上段に「今日 / 今月 / 累計」のサマリカード3枚(各: calls、**¥ を `text-lg font-semibold` で主表示、$ を `text-xs text-secondary` で併記**)。既存の全体サマリ(トークン・cache hit rate)はその下に維持し、cost 表示を ¥$ 併記に変更
  - 「月別コスト」セクションを新設(月・呼び出し数・cost ¥$ 併記)。既存の日別テーブル(30日制限済み)・モデル別テーブルは cost 列を ¥$ 併記に変更。見出しの「cost（生値）」は「コスト」に変更し、ページ冒頭に「円換算は USD_JPY_RATE=<レート> による目安」の注記を追加
  - ページ上部に `<Link href="/">← チャットに戻る</Link>`、および `process.env.EVAL_UI_ENABLED` が truthy のときのみ `<Link href="/eval">評価コンソール</Link>`(RSC なので env を直接読む。`next/link` を import)
- [ ] **Step 2: `components/Header.tsx` に「利用状況」リンク追加** — `next/link` の `<Link href="/usage">` をモード切替タブの並び(デスクトップ・モバイル両方)に既存ボタンと同じ見た目(`var(--bg-tertiary)` ベース)で追加。既存 props は変更しない
- [ ] **Step 3: dev サーバーで手動確認** — `/` の Header から `/usage` へ遷移でき、サマリカード・月別テーブル・¥$ 併記が表示される(ローカル DB にデータがなければチャットを1往復して行を作る)。`EVAL_UI_ENABLED` 未設定で「評価コンソール」リンクが出ないこと
- [ ] **Step 4: tsc → コミット**(`feat: usage ページに日次/月次/円換算サマリとナビ導線を追加`)

### Task 4: PR① ドキュメント + PR 作成

- [ ] `README.md`(usage について記載があれば)と `PROGRESS.md` 完了済みセクションに追記。設計書は既に `docs/superpowers/specs/` にコミット済み(このブランチに cherry-pick または PR② 側に含める — 実装順に応じてどちらか一方にのみ含めること)
- [ ] `npx tsc --noEmit` 最終確認 → push → PR 作成(マージはユーザー承認)

---

## PR②: 評価 GUI(ブランチ `feat/eval-gui`、PR① マージ後に main から分岐)

### Task 5: ハーネスに進捗コールバック・中断シグナルを追加

**Files:**
- Modify: `scripts/eval/harness.ts`

**Interfaces(Produces):**
```ts
// EvalConfig に追加(いずれも optional。CLI からは未使用で挙動不変)
export interface EvalProgress {
  scenarioIndex: number;  // 0-based
  scenarioCount: number;
  scenarioId: string;
  turnIndex: number;      // 0-based。シナリオ開始時は 0
  turnCount: number;
}
onProgress?: (p: EvalProgress) => void;
shouldCancel?: () => boolean;
// EvalRunResult に追加
cancelled: boolean; // shouldCancel によりシナリオ境界で停止した場合 true
```

- [ ] **Step 1: 実装** — シナリオループ先頭で `if (cfg.shouldCancel?.()) { cancelled = true; break; }`。各ユーザーターン送信前に `cfg.onProgress?.({...})` を呼ぶ。中断時もそれまでの `scenarioResults` でレポートを組み立てて返す(レポートは書ける状態を維持)
- [ ] **Step 2: tsx ワンオフで検証** — `chatCompletion` を叩かずに検証するのは難しいため、`scenarios: []` 相当の構造検証 + 「`shouldCancel` が即 true を返す cfg で `runEval` を呼ぶと API を1回も呼ばず `cancelled: true` で返る」ことを確認(APIキー不要で完結する)
- [ ] **Step 3: `run.ts`/`sweep.ts` が無変更でコンパイル・動作すること(tsc)→ コミット**

### Task 6: quiz 実行ロジックの関数化

**Files:**
- Create: `scripts/eval/quiz-runner.ts`
- Modify: `scripts/eval/quiz.ts`(CLI を quiz-runner 利用に書き換え)

**Interfaces(Produces):**
```ts
export interface QuizRunConfig {
  apiKey: string; persona: Persona; systemPrompt: string;
  fewShot: { role: string; content: string }[];
  quiz: QuizItem[]; model: string; temperature: number | null;
  onProgress?: (p: { itemIndex: number; itemCount: number }) => void;
  shouldCancel?: () => boolean;
}
export interface QuizRunResult { items: QuizItemResult[]; totalCostUsd: number | null; cancelled: boolean }
// QuizItemResult(question/answer/grade/notes)は quiz.ts から quiz-runner.ts に移動して export
export async function runQuiz(cfg: QuizRunConfig): Promise<QuizRunResult>;
```

- [ ] **Step 1: quiz.ts の実行ループを `runQuiz` に移植**(コンソール出力は quiz.ts 側に残す: runQuiz は data を返すだけにし、CLI が ○/× 表示・テーブル・レポート書き出しを担当)。レポート組み立て(`QuizReport` 型と `writeQuizReport`)も quiz-runner.ts に移して export(API からも使うため)
- [ ] **Step 2: CLI の回帰確認** — `npm run eval:quiz -- --persona tetsu-oyaji --dataset scripts/eval/datasets/example-tetsu-oyaji.json` が従来同等の出力(コスト <$0.001、実行してよい)
- [ ] **Step 3: tsc → コミット**(`refactor: quiz 実行ロジックを quiz-runner に切り出し`)

### Task 7: ガードとジョブストア

**Files:**
- Create: `lib/eval-ui/guard.ts`
- Create: `lib/eval-ui/job-store.ts`

**Interfaces(Produces):**
```ts
// guard.ts
export function isEvalUiEnabled(): boolean; // process.env.EVAL_UI_ENABLED が "1" or "true"
// job-store.ts(モジュールスコープ単一ジョブ)
export interface EvalJobParams { kind: "eval" | "quiz"; personaId?: string; personaFile?: string; datasetPath?: string; model: string; temperature: number | null; scenariosCount: number | null; maxTurns: number | null }
export interface EvalJobState {
  id: string; kind: "eval" | "quiz";
  status: "running" | "done" | "failed" | "cancelled";
  params: EvalJobParams;
  progress: { current: number; total: number; detail: string } | null; // detail 例 "シナリオ 2/3: casual-chat ターン 5/8"
  startedAt: string; finishedAt: string | null;
  error: string | null; reportPath: string | null;
}
export function getCurrentJob(): EvalJobState | null;
export function tryStartJob(params: EvalJobParams): EvalJobState | null; // 実行中(status==="running")なら null
export function updateProgress(id: string, progress: EvalJobState["progress"]): void;
export function finishJob(id: string, result: { status: "done" | "failed" | "cancelled"; error?: string; reportPath?: string }): void;
export function requestCancel(): boolean; // running ジョブがあればフラグを立て true
export function isCancelRequested(id: string): boolean;
```

- [ ] **Step 1: 実装**(job id は `Date.now().toString(36)` 程度で可。前ジョブが running でなければ `tryStartJob` は上書きで新ジョブ開始)
- [ ] **Step 2: tsx ワンオフで状態遷移を検証**(start→progress→finish / running 中の tryStartJob→null / requestCancel→isCancelRequested true / done 後は再 start 可)
- [ ] **Step 3: tsc → コミット**

### Task 8: eval API routes

**Files:**
- Create: `app/api/eval/run/route.ts`
- Create: `app/api/eval/status/route.ts`
- Create: `app/api/eval/cancel/route.ts`
- Create: `app/api/eval/reports/route.ts`
- Create: `app/api/eval/reports/[filename]/route.ts`

**Interfaces(Consumes):** Task 5〜7 の全 export。ペルソナ解決は `personaFile` 指定時 `loadPersonaSource({ file })`(`scripts/eval/persona-loader.ts`)、`personaId` 指定時は `ensureDb()` + `getPersona(client, id)`(`lib/db-personas`、chat route と同じ)。プロンプトは `buildSystemPrompt` / `buildFewShotMessages`(`lib/prompt`)、マーカーは `deriveMarkers`(`scripts/eval/markers`)、データセットは `loadDataset`。

**共通ガード:** 全 route の先頭で `if (!isEvalUiEnabled()) return new Response(null, { status: 404 });`

- [ ] **Step 1: `POST /api/eval/run`**
  - body: `EvalJobParams`(zod は未導入なので手動バリデーション: kind 必須、persona いずれか必須、quiz は datasetPath 必須、等。エラーは 400 + 日本語 `{ error }`)
  - `tryStartJob` が null なら 409 `{ error: "別の評価が実行中です" }`
  - ジョブ本体は **`(async () => { ... })()` を await せず起動**し、即 202 `{ jobId }` を返す。本体は persona/dataset 解決 → `runEval` or `runQuiz`(`onProgress` で `updateProgress`、`shouldCancel` は `isCancelRequested`)→ `writeReport`/`writeQuizReport` → `finishJob`。throw 時は `finishJob({ status: "failed", error })`
  - `OPENROUTER_API_KEY` は `process.env` から。未設定なら 400(日本語エラー)。**judge モデルは既定 `google/gemini-3.1-flash-lite`(env `EVAL_JUDGE_MODEL`)、maxHistory は 30 で固定**(CLI の既定と同じ。GUI からは指定させない = YAGNI)
- [ ] **Step 2: `GET /api/eval/status`** — `Response.json(getCurrentJob())`(null なら null を返す)
- [ ] **Step 3: `POST /api/eval/cancel`** — `requestCancel()` の結果を `{ cancelled: boolean }` で返す
- [ ] **Step 4: `GET /api/eval/reports`** — `eval/reports/*.json` を `fs.readdir` し、各ファイルの JSON から一覧用メタを抽出して新しい順に返す: `{ filename, kind: "eval" | "quiz"(ファイル名 quiz- プレフィクスで判定), createdAt, persona, model, judgeAvg(4観点平均) | null, referenceFidelity | null, accuracy | null, totalCostUsd }`。パース不能ファイルはスキップ
- [ ] **Step 5: `GET /api/eval/reports/[filename]`** — **`/[^a-zA-Z0-9._-]/` を含む filename は 400**(パストラバーサル対策)。`path.join(REPORTS_DIR, filename)` を読んで JSON を返す。存在しなければ 404
- [ ] **Step 6: 検証** — `EVAL_UI_ENABLED` 未設定で全 route が 404 を返すこと(curl)。設定済みで status が null を返すこと。tsc → コミット

### Task 9: `/eval` ページ(フォーム + 進捗 + 履歴)

**Files:**
- Create: `app/eval/page.tsx`(RSC: `isEvalUiEnabled()` が false なら `notFound()`。DB からペルソナ一覧を取得しクライアントに渡す)
- Create: `components/EvalConsole.tsx`(`"use client"`。3ブロック UI 本体)

**Interfaces(Consumes):** Task 8 の API。ペルソナ一覧は page.tsx(RSC)で `listPersonas` 相当(chat が使う `lib/db-personas` の一覧関数)を取得して props 渡し。

- [ ] **Step 1: `app/eval/page.tsx`** — ガード(`notFound()`)+ ペルソナ一覧取得 + `<EvalConsole personas={...} />`。`<Link href="/usage">` と `<Link href="/">` の相互リンクも配置。`export const dynamic = "force-dynamic"`
- [ ] **Step 2: `EvalConsole` 実行フォーム** — 評価種別(eval/quiz のラジオ)、ペルソナ(DB 一覧の select + 「ファイルパス直接入力」の text 切替)、データセットパス(text。quiz 選択時は必須マーク)、モデル(text、既定 `deepseek/deepseek-v4-flash`)、temperature(空=未指定)、シナリオ数(1〜10)、max-turns。**推定コール数表示**: eval は `シナリオ数 × maxTurns(未指定は16) + シナリオ数`(sweep.ts の見積り式)、quiz は「設問数はデータセット依存」の注記のみ。「実行」で `POST /api/eval/run` → 409/400 はエラー表示
- [ ] **Step 3: 実行中パネル** — `GET /api/eval/status` を 2 秒間隔でポーリング(`setInterval`、running でなくなったら停止し履歴を再取得)。progress の `detail` とプログレスバー(`current/total`)、中断ボタン(`POST /api/eval/cancel`)。failed 時は error 表示
- [ ] **Step 4: 履歴一覧** — マウント時と実行完了時に `GET /api/eval/reports` を取得しテーブル表示(日時・種別・ペルソナ・モデル・judge平均 or 正答率・refFidelity・コスト)。行クリックで `GET /api/eval/reports/[filename]` を取得し、詳細を展開(eval: シナリオ別の drift/judge テーブル + aggregate、quiz: 設問別 ○/× と応答)。スタイリングは usage ページのテーブル・セクション構造を踏襲
- [ ] **Step 5: e2e 手動確認(実 API・小コスト可)** — dev サーバー + `EVAL_UI_ENABLED=1` で: (a) eval を tetsu-oyaji × 1シナリオ × 2ターン + example データセットで GUI から実行し、進捗→完了→履歴に行が増える→詳細に refFidelity が出る (b) quiz を同様に実行し正答率表示 (c) 実行中の二重実行が 409 でエラー表示 (d) 中断ボタンで cancelled (e) `EVAL_UI_ENABLED` を外して `/eval` が 404
- [ ] **Step 6: tsc → コミット**(`feat: 評価コンソール /eval を追加(ローカル専用)`)

### Task 10: PR② ドキュメント + PR 作成

- [ ] `.env.example` に `EVAL_UI_ENABLED=`(注釈: ローカル専用、本番に設定しない)追記。`scripts/eval/README.md` に GUI の存在と起動方法を追記。`README.md` の機能一覧に評価コンソール(ローカル専用)を追記。`PROGRESS.md` 完了済みに追記。プロジェクト `CLAUDE.md` の「現在のフェーズ」が実態と乖離していれば更新
- [ ] dev サーバー停止 → `npx next build` が通ること(ガード付きページの本番ビルド確認)→ `rm -rf .next`
- [ ] push → PR 作成(マージはユーザー承認)

---

## Self-Review 済みチェック

- 設計書の全要件をタスクにマッピング済み(GUI 機能範囲=実行+結果+履歴 / ガード / 円換算 / 月次 / ナビ / エラーハンドリング / 404 検証)
- compare GUI 化・認証問題はスコープ外(設計書どおり)
- JST 基準への変更(Task 1)は設計書に無い追加判断 → PR 説明で明示すること
