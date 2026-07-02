# Issue #20 仕様書: ペルソナデータ設計・コンテキスト戦略・コスト最適化

## 概要

MVP2 完了後の改善フェーズ。以降のあらゆる判断（モデル変更 vs データ拡充、履歴カットの効果、キャッシュ最適化の効果）を机上試算ではなく **OpenRouter の実測 usage** に基づいて行うための土台を整備し、その計測結果を根拠にコンテキスト戦略とコストを最適化する。

方針は一貫して **計測ファースト / YAGNI**（効果が計測で確認できない改善は入れない）。タスク T1〜T7 として実施し、1 タスク = 1 PR（PR #25〜#32）で main にマージ済み。

## タスク別仕様

### T1. usage 実測ログ基盤

OpenRouter レスポンスに含まれる実測 usage（`prompt_tokens` / `completion_tokens` / `prompt_tokens_details.cached_tokens` / `cost`）を DB に記録し、モデル別・日別のコスト／キャッシュヒット率を可視化する。

**実装:**
- `usage_log` テーブルを追加（下記スキーマ参照）
- 3 つの LLM 呼び出し経路（`chat` / `convert` / `extract`）でリクエスト body に `usage: { include: true }` を付与し、応答から usage を捕捉して記録
- 記録処理は `try/catch` で握りつぶす（ログ失敗がユーザー応答を壊さない fire-and-forget）
- `GET /api/usage` で集計を返し、`/usage` ページでモデル別テーブル（呼び出し数・トークン・コスト・キャッシュヒット率）と日別コストを表示

**実測で判明した事実:**
- DeepSeek V4 Flash のプレフィックスキャッシュは有効。同一ペルソナの 2 通目以降で `cached_tokens > 0`、実測ヒット率は約 43%
- ただしプロバイダルーティング依存で**非決定的**（回によっては 0% になる）。単発値ではなく `/usage` の多リクエスト集計で経時観測する

### T2. 会話履歴の上限管理

長い会話でコンテキスト（＝コスト）が無制限に膨らむのを防ぐため、LLM 送信時に直近メッセージ数を上限でカットする。

**仕様:**
- 環境変数 `CHAT_MAX_HISTORY_MESSAGES`（既定 30）で上限を制御。0 以下・非数値なら既定値
- system プロンプト + few-shot は常に固定プレフィックスとして保持し、これを超えた古い user/assistant 履歴のみ落とす
- カット後の先頭が assistant 発話になる場合は 1 件落として user 始まりに揃える
- カットは **LLM 送信時のみ**。DB 保存・サイドバー表示・記憶抽出には影響しない
- 設計上の性質: 上限超過後は毎ターン履歴部分のプレフィックスキャッシュが崩れ、キャッシュヒットは system + few-shot 部分に縮退する（バグではない）

### T3. 記憶抽出の重複防止

会話からの記憶抽出（`POST /api/memories/extract`）で、既存記憶と重複するエントリを登録しない。

**仕様:**
- 抽出前に既存記憶を読み込み、抽出プロンプトに「既存の記憶」ブロックとして渡して LLM 側の重複生成を抑制（既存が空なら付与しない＝プレフィックスキャッシュを壊さない）
- 加えてサーバ側で内容の完全一致デデュープ（`content.trim()` の集合と突合し、一致するものはスキップ）

### T4. 評価基盤（マルチターン品質・コスト計測）

口調ドリフトと応答品質を定量評価する CLI ハーネス（`scripts/eval/`）。

**仕様:**
- `npm run eval` — 単一構成（persona × model × temperature）でシナリオ群を実行し、口調ドリフト検出 + LLM-as-Judge 採点のレポートを出力
- `npm run eval:compare` — 2 つのレポート JSON の品質／コスト差分を表示
- `npm run eval:sweep` — 複数モデル × temperature を一括実行して比較表を生成
- 口調ドリフト: 正規表現マーカー（一人称・語尾・口癖）を会話の early / late 1/3 で比較
- LLM-as-Judge: 被評価モデルと**別系統**のモデルで 4 観点（tone / knowledge / persona / naturalness）を 1-5 採点。Judge モデルは `EVAL_JUDGE_MODEL`（既定 `google/gemini-3.1-flash-lite`）
- 生成レポート（`scripts/eval/reports/`）は `.gitignore` 済み

**baseline 実測:** 実キャラ 1 体 × DeepSeek V4 Flash × 全 10 シナリオ × 16 ターン（maxHistory=30、総コスト $0.040）。口調ドリフトはほぼ検出されず（一人称 72%→78%、語尾 68%→70%、Judge ほぼ 5.0）。現行構成の品質は十分と確認。

### T5. モデル × temperature の実験と決定

**実験:** 4 モデル（deepseek-v4-flash / -pro、gemini-3.1-flash-lite、grok-4.3）× temperature {0.3, 1.0} × 先頭 4 シナリオ × 8 ターン（288 API コール、総コスト $0.31）。

**決定:**
- **DeepSeek V4 Flash 継続が最適。** Judge 天井品質（全観点 5.0）を最安（他モデルの 4〜10 倍安い）で達成。Pro は品質改善ゼロで 4〜7 倍コスト、Grok は品質劣・最高コストで不採用。Gemini Flash Lite は口調マーカー最良だが Judge 差なし・6 倍コストのため premium 選択肢として保留
- **temperature 変更は不要。** 0.3 vs 1.0 で有意差なし → `CHAT_TEMPERATURE` は**未設定のまま維持**（本番はプロバイダ既定）
- 方法論的留意点: 上位モデルで Judge が軒並み 5.0 になる「判定の飽和（天井効果）」がある。より厳しい比較には難度の高いシナリオ・厳格 rubric・別系統 Judge が必要

### T6. ペルソナデータ品質改善

**anti_examples フィールド（任意）:**
- ペルソナ定義に「こう応答してはいけない悪い例」を任意で追加できる（`anti_examples: { user, assistant }[]`）
- システムプロンプトに `## こう応答してはいけない（悪い例）` 見出しで、否定文脈（「〜のような応答はしない」）として描画
- スキーマのみ追加し、サンプルペルソナには未投入（逆誘発リスクを避けるため dormant）

**YAML 再シードの差分更新（content_hash ベース）:**
- 起動時の YAML→DB 同期で、YAML 内容の SHA-256 ハッシュを `seeded_personas.content_hash` と突合
- ハッシュ一致 → スキップ、相違 → `source='yaml'` の行のみ再反映
- `source='db'`（UI で新規作成したペルソナ）は保護対象で上書きしない。ユーザーが削除済みの YAML ペルソナは 0 行更新となり復活しない
- **割り切り:** UI で編集した `source='yaml'` ペルソナは `source='db'` に昇格させない。次回 YAML 更新（ハッシュ相違）時に UI 編集が上書きされ得る（意図した挙動）
- 見送り（計測ファースト/YAGNI）: 会話例の拡充・知識のエピソード化は、T4/T5 で Judge 天井・ドリフト無しと実証済みのため実施しない

### T7. プロンプト構造のキャッシュ最適化

プレフィックスキャッシュのヒット率を上げるため、システムプロンプトを「静的 → 可変 → 指示」の順に再配置（文言・内容は不変）。

**セクション順序（`buildSystemPrompt`）:**
1. キャラクター宣言
2. 性格 / 3. 経歴 / 4. 話し方 / 5. 固有知識 / 6. 記憶 / 7. 行動制約 / 8. anti_examples ← ここまで静的
9. エピソード記憶（会話で変動）
10. 重要な指示（最末尾・固定）

効果は cached_tokens の単発値では測れず、`/usage` の集計で経時観測する方針。

## DB スキーマ追加

```sql
CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route TEXT NOT NULL,              -- 'chat' | 'convert' | 'extract'
  session_id TEXT,                  -- convert 等セッション無しは NULL
  persona_id TEXT,
  model_id TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL,                        -- OpenRouter 実費（返らない場合 NULL）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- インデックス: idx_usage_log_created(created_at DESC), idx_usage_log_model(model_id)
```

## 環境変数

| 変数 | 既定 | 用途 |
|------|------|------|
| `CHAT_MAX_HISTORY_MESSAGES` | 30 | チャット履歴の上限メッセージ数（T2）。0 以下で無制限扱い |
| `CHAT_TEMPERATURE` | 未設定 | チャットの temperature（0〜2）。未設定でプロバイダ既定。T5 の結論で本番は未設定維持 |
| `EVAL_JUDGE_MODEL` | `google/gemini-3.1-flash-lite` | 評価基盤（T4）の LLM-as-Judge モデル。本番 chat には影響しない |

## 残留課題（次回改修候補・現状は実害なし）

- T5 スイープの Gemini 行は Judge が被評価モデルと同一系統（自己選好バイアスの疑い）。採用決定には影響しないが、再評価時は別系統 Judge を用いる
- T4 の Judge 失敗時スコア 0 が平均を歪め得る。次回ハーネス改修で失敗シナリオを集計から除外する
