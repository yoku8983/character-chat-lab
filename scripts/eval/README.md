# 評価ハーネス（T4: multi-turn 会話ハーネス）

被評価モデル（既定 DeepSeek V4 Flash）に 15〜18 ターンのスクリプト化された会話を流し、
(A) 正規表現による口調ドリフト検出、(B) 別系統モデル（既定 Gemini 3.1 Flash Lite）による
LLM-as-Judge 採点、を行いレポート JSON とコンソール要約を出す、スタンドアロン CLI バッチです。

Next.js アプリ本体（`app/` / `lib/`）とは独立した `scripts/eval/` 配下のツールで、`tsx` で直接実行します。

## 使い方

### 本番相当のペルソナ JSON を評価する

```bash
npm run eval -- --persona-file <本番ペルソナJSONのパス> --model deepseek/deepseek-v4-flash
```

### リポジトリ同梱ペルソナ（personas/*.yaml）で評価する

```bash
npm run eval -- --persona tetsu-oyaji --model deepseek/deepseek-v4-flash
```

### スモークテスト（シナリオ数・ターン数を絞って素早く確認）

```bash
npm run eval -- --persona tetsu-oyaji --scenarios 1 --max-turns 4
```

### オプション一覧

| オプション | 説明 | 既定値 |
| --- | --- | --- |
| `--persona <id>` | `personas/*.yaml` から読み込むペルソナ ID（`--persona-file` と排他ではなくどちらか必須） | - |
| `--persona-file <path>` | ペルソナ定義ファイル（YAML/JSON）のパス | - |
| `--model <id>` | 被評価モデル | `deepseek/deepseek-v4-flash` |
| `--temperature <num>` | temperature（指定時のみ API に送る） | 未指定 |
| `--judge <id>` | LLM-as-Judge に使うモデル | 環境変数 `EVAL_JUDGE_MODEL`、なければ `google/gemini-3.1-flash-lite` |
| `--max-history <n>` | チャット履歴の上限（`lib/history.ts` の `capMessageHistory` を使用）。`0` で無制限 | `30` |
| `--scenarios <n>` | 先頭 n 本のシナリオのみ実行（全 10 本のうちスモーク用に絞る） | 全 10 本 |
| `--max-turns <n>` | 各シナリオの発話を先頭 n 個に切る（スモーク用） | 無制限 |

レポートは `eval/reports/` に JSON で書き出されます（Git 管理外）。

### レポートの比較（T5 のモデル×temperature 実験にも利用）

```bash
npm run eval:compare <before.jsonのパス> <after.jsonのパス>
```

`eval:compare` はコンソール要約のみで、ファイルは生成しません。

### temperature の設定場所

- **本番** (`app/api/chat/route.ts`): 環境変数 `CHAT_TEMPERATURE`（0〜2 にクランプ、未設定なら送らずモデル既定に委ねる）
- **評価 CLI** (`npm run eval`): `--temperature <num>`（指定時のみ API に送る）
- **スイープ** (`npm run eval:sweep`): `--temps <csv>`（後述）

### スイープ実行（T5: モデル × temperature をまとめて比較）

複数モデル × 複数 temperature の組み合わせを一括実行し、口調ドリフト・Judge スコア・コストを
比較表で確認できます。

```bash
npm run eval:sweep -- --persona-file <本番ペルソナJSONのパス> --scenarios 3 --max-turns 8
```

```bash
npm run eval:sweep -- --persona tetsu-oyaji --models deepseek/deepseek-v4-flash,x-ai/grok-4.3 --temps 0.3,0.7,default
```

**コスト注意**: 構成数（`--models` の数 × `--temps` の数）× シナリオ数 × ターン数の分だけ API 呼び出しが
増えます。実行前に推定呼び出し回数をログに表示しますが、フルシナリオ・フル構成での実行は高コストに
なりがちなので、まずは `--scenarios` / `--max-turns` を絞ったスモーク実行を推奨します。

#### スイープのオプション

| オプション | 説明 | 既定値 |
| --- | --- | --- |
| `--persona <id>` / `--persona-file <path>` | 評価対象ペルソナ（どちらか必須） | - |
| `--models <csv>` | 比較対象モデル（カンマ区切り） | `deepseek/deepseek-v4-flash,deepseek/deepseek-v4-pro,google/gemini-3.1-flash-lite,x-ai/grok-4.3` |
| `--temps <csv>` | 比較対象 temperature（カンマ区切り）。`default` を含めると temperature 未指定（モデル既定）も比較できる | `0.3,0.7,1.0` |
| `--judge <id>` | Judge モデル | 環境変数 `EVAL_JUDGE_MODEL`、なければ `google/gemini-3.1-flash-lite` |
| `--max-history <n>` | チャット履歴の上限 | `30` |
| `--scenarios <n>` | 先頭 n 本のシナリオのみ実行 | 全 10 本 |
| `--max-turns <n>` | 各シナリオの発話を先頭 n 個に切る | 無制限 |

実行結果は構成ごとの比較表として `console.table` に出力され、全構成をまとめた JSON レポートが
`eval/reports/sweep-<日時>-<persona>.json` として書き出されます（Git 管理外）。

## メトリクスの意味

### (A) 口調ドリフト検出（正規表現ベース）

ペルソナの `identity.speaking_style` から一人称・語尾・口癖のマーカーを抽出し、各ターンの
assistant 応答にそれらが含まれるかを判定します。会話を先頭 1/3（early）・末尾 1/3（late）に分け、
出現率（0〜1）を算出します。

- `early` / `late`: 各区間でのマーカー出現率
- `delta = late - early`: 負の値が大きいほど、会話が進むにつれて口調が薄れている（ドリフトしている）ことを示します

### (B) LLM-as-Judge 採点

被評価モデルとは別系統のモデル（既定 Gemini 3.1 Flash Lite）が、キャラクター定義と会話全文を読み、
4 観点を各 1〜5 の整数で採点します。

- `toneConsistency`: 口調一貫性
- `knowledgeUse`: 知識活用度
- `personaMaintenance`: 人格維持
- `naturalness`: 自然さ
- `comment`: 日本語 1〜2 文の総評

JSON パースに失敗した場合は全スコア `0` + `comment` にエラー要旨が入ります（このシナリオ全体は
スキップされず、Judge スコアのみ `0` として記録されます）。

## 環境変数

- `OPENROUTER_API_KEY`（必須）: 未設定時はリポジトリ直下 `.env.local` から自動読み込みします
- `EVAL_JUDGE_MODEL`（任意）: Judge モデルの既定値を上書き

## 注意事項

**本番（Main ブランチ → Azure Container Apps デプロイ）で運用しているペルソナ JSON をローカルで
評価する際は、ローカル開発版との環境差分に注意してください。** 具体的には:

- プロンプト構築ロジック（`lib/prompt.ts` の `buildSystemPrompt` / `buildFewShotMessages`）がローカルの
  チェックアウト時点のものであり、本番デプロイ済みのコードと異なる可能性がある
- 本番の DB（エピソード記憶など）はこのハーネスでは参照しない（`episodicMemories` は常に空で評価する）
- `CHAT_MAX_HISTORY_MESSAGES` など本番の環境変数設定と、このスクリプトの `--max-history` 既定値
  （30）が一致しているとは限らない

評価結果はあくまで「このローカルコード + 指定ペルソナ定義」でのスナップショットである点を踏まえて解釈してください。
