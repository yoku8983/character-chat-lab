# 設計書: 品質回帰チェックの仕組み化（Issue #34 T2・ローカル運用 + GUI 統合）

- 日付: 2026-07-04
- 対象 Issue: #34 T2「品質回帰の継続トラッキング」
- ステータス: ユーザー承認済み

## 背景と目的

プロンプト構築ロジック（`lib/prompt.ts`）・ペルソナ定義・モデル/温度設定を改修したとき、キャラ応答品質が劣化していないかを検知する仕組みが無い。評価 CLI（`npm run eval`）と評価 GUI（`/eval`）は存在するが、「基準値と比べて合否を出す」機能が無く、比較 CLI（`eval:compare`）は差分数値を表示するだけで人間が解釈する必要がある。

**最悪のシナリオは「評価のやり方が煩雑で、人間が手順を思い出せず、結局実行されずに放置される」こと。** 本設計はこれを防ぐため、回帰チェックを GUI のワンボタン操作に落とし込み、運用手順を README に人間が読める形で明文化する。

## スコープ判断（ユーザー確定事項）

- **GitHub Actions（CI）化は見送り**。理由: 本番実キャラのペルソナ JSON・正解データセットはリポジトリコミット禁止（著作権隔離方針）のため CI から直接使えない。サンプルキャラ（AI 創作の架空キャラ）での CI は「あるべき応答を人間が検証できない・初期開発以降手を加えない」ため監視の意義が薄いと判断。著作権切れキャラ（パブリックドメイン）を CI 専用キャラにする案も検討したが、ローカル手動運用で困らないため見送り
- **本番会話のサンプリング採点（Issue #34 T2 の将来・任意項目）も見送り**
- 採用: **ローカル運用 + GUI ワンボタン化**。改修したタイミングで `/eval` から回帰チェックを実行する運用
- 見送り 2 件は Issue #34 にコメントで判断理由を残す

## 運用イメージ（人間の操作）

1. 初回（または意図的な品質変更後）: `/eval` で評価を実行し、結果レポートの「ベースラインに設定」ボタンを押す
2. 改修したら: `/eval` 上部の「回帰チェック実行」ボタンを押す → ベースラインと同一構成で評価が自動実行され、完了後に **PASS / FAIL バッジ + 観点別の基準値/今回値/差分テーブル**が表示される
3. FAIL したら: どの観点がどれだけ下落したかが画面に出るので、改修内容を見直すか、意図的な変更ならベースラインを更新する

コマンドを覚える必要はない。`/eval` へはヘッダーの「評価」リンクから 1 クリックで遷移できる（本 PR で追加。`EVAL_UI_ENABLED` 有効時のみ表示）。

## コンポーネント設計

### 1. 判定ロジック: `scripts/eval/regression.ts`（新設・純粋関数）

```
checkRegression(baseline: EvalReport, current: EvalReport, thresholds?: Thresholds)
  → { pass: boolean, findings: RegressionFinding[] }
```

- 判定基準（既定値。`thresholds` で変更可能）:
  - Judge 4観点（口調一貫性・知識活用度・人格維持・自然さ）の各平均: 基準から **−0.5 以上下落で FAIL**
  - `referenceFidelity`（参照付き Judge。**両レポートに存在する場合のみ**比較）: 同じく **−0.5 で FAIL**
  - 口調マーカー late 出現率（一人称・語尾）: **−15pt 以上下落で FAIL**
- `findings` は FAIL/PASS を問わず全観点の { 観点名, 基準値, 今回値, 差分, 判定 } を返す（GUI テーブル・CLI 表の共通データ源）
- CLI と GUI の両方がこの関数を使い、判定基準のズレを防ぐ

### 2. ベースライン保存: `eval/baselines/<personaId>.json`

- ペルソナごとに 1 スロット（上書き方式）。中身は評価レポート JSON そのもの（構成情報は既存の `meta` に含まれる）
- `eval/baselines/` は `.gitignore` に追加（実キャラのレポートが入るため。`eval/reports/` と同じ隔離方針）
- 読み書きは `lib/eval-ui/baseline.ts`（新設）に集約: `saveBaseline(report)` / `loadBaseline(personaId)` / `listBaselines()`

### 3. API route（すべて既存の `isEvalUiEnabled()` ガード適用・無効時 404）

- `POST /api/eval/baseline` — body: `{ filename }`（`eval/reports/` 内のレポートファイル名。既存の filename ホワイトリスト検証を適用）。該当レポートを読み、`meta` の personaId でベースライン保存
- `GET /api/eval/baseline` — ベースライン一覧（personaId・保存日時・構成サマリ）
- `POST /api/eval/check` — 指定 personaId のベースライン `meta` から構成（モデル・シナリオ数・ターン数・データセット・temperature）を復元して評価ジョブを起動（既存 job-store の単一ジョブ制約に従う。実行中なら 409）。ジョブ完了時に `checkRegression` を実行し、結果（pass/findings）をジョブ結果に含める
- 既存 `GET /api/eval/status` のレスポンスに回帰チェック結果フィールドを追加（チェック実行時のみ）

### 4. GUI: `components/EvalConsole.tsx` への追加

- **過去レポート一覧の各行に「ベースラインに設定」ボタン**。設定済みベースラインと同一 personaId の場合は上書き確認
- **ページ上部に「回帰チェック」セクション**: ベースライン一覧（ペルソナ・取得日・構成）と「回帰チェック実行」ボタン。実行前に推定 API コール数の目安を表示（既存フォームと同様）。ベースライン未設定時は「まず評価を実行し、結果をベースラインに設定してください」と誘導文言を表示
- **結果表示**: PASS（緑）/ FAIL(赤) バッジ + 観点別テーブル（観点 / 基準値 / 今回値 / 差分 / 判定）。進捗表示・中断は既存のポーリング機構をそのまま利用

### 5. ヘッダー導線: `components/Header.tsx`

- 「評価」リンクを追加（デスクトップ・モバイル両方）。`EVAL_UI_ENABLED` 有効時のみ表示し、無効時は一切見えない。フラグはサーバー側（`app/layout.tsx` 等の RSC）から props で渡す（クライアントに環境変数を直接参照させない）

### 6. CLI: `eval:compare --check`

- 既存 `npm run eval:compare <before> <after>` に `--check` フラグを追加。`checkRegression` を呼び、観点別テーブルと PASS/FAIL を出力。**FAIL は exit code 1**（PASS は 0）
- 閾値オプション: `--judge-threshold`（既定 0.5）/ `--marker-threshold`（既定 15）
- `--check` なしの既存挙動は完全維持（後方互換）

### 7. ドキュメント（重要・本設計の主目的の一部）

- `scripts/eval/README.md` に「品質回帰チェックの運用」章を新設。**「いつやるか」から書く**:
  1. どういう変更をしたらチェックするか（`lib/prompt.ts`・ペルソナ定義・モデル/温度設定を触ったとき）
  2. GUI での手順（画面の操作順に箇条書き）
  3. FAIL が出たときの読み方・対処（改修見直し or 意図的変更ならベースライン更新）
  4. ベースラインを更新すべきタイミング
  5. CLI 手順は補足扱いで最後に記載
- ルート `README.md` に `/eval` の回帰チェック機能とヘッダー導線を追記

## エラーハンドリング

- ベースライン `meta` に構成情報が欠けている（旧形式レポート）場合: チェック実行を日本語エラーで拒否し「新しく評価を実行してベースラインを取り直してください」と案内
- ベースラインのデータセットパス（ローカル専用ファイル）が消えている場合: 実行前に存在チェックし日本語エラーで案内
- 比較対象の構成不一致（モデル等）はチェック実行では起きない設計（ベースラインの構成で自動実行するため）。CLI `--check` では構成不一致を警告表示（中断はしない。意図的な構成変更の比較を妨げない）

## テスト・検証方針（既存流儀を踏襲）

- `checkRegression` は tsx ワンオフスクリプトで境界値検証（閾値ちょうど・下落・改善・referenceFidelity 片方欠落・マーカー欠落）。コミットはしない
- GUI は dev サーバー + 実 API での e2e（縮小構成、数円程度のコスト。従来の PR と同様に実施可）
- `npx tsc --noEmit` パス、`npx next build` 成功（dev サーバー停止後）
- 既存 CLI（`eval` / `eval:compare` フラグなし / `eval:quiz`）の後方互換をスモークで確認

## 変更ファイル一覧（見込み)

| ファイル | 変更 |
|---|---|
| `scripts/eval/regression.ts` | 新設（判定純粋関数） |
| `scripts/eval/compare.ts` | `--check` フラグ追加 |
| `lib/eval-ui/baseline.ts` | 新設（ベースライン読み書き） |
| `app/api/eval/baseline/route.ts` | 新設（GET/POST） |
| `app/api/eval/check/route.ts` | 新設（POST） |
| `app/api/eval/status/route.ts` | 回帰結果フィールド追加 |
| `lib/eval-ui/job-store.ts` | ジョブ結果に回帰チェック結果を持てるよう拡張 |
| `components/EvalConsole.tsx` | ベースライン設定・回帰チェック UI |
| `components/Header.tsx` / `app/layout.tsx` | 「評価」リンク（フラグは RSC から props） |
| `.gitignore` | `eval/baselines/` 追加 |
| `scripts/eval/README.md` / `README.md` | 運用ガイド |
| `PROGRESS.md` / Issue #34 | 完了メモ・チェックボックス・見送りコメント |

アプリの一般ユーザー向け画面（チャット・ペルソナ管理等）は無変更。
