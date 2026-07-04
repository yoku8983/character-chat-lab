# character-chat-lab

AIキャラクターの人格・口調・固有知識・長期記憶を定義し、高品質な疑似会話や口調変換を行う汎用Webアプリケーション。

## コンセプト

「ペルソナ定義」を共通フォーマットで管理し、任意のキャラクターとして深いレベルでAIチャットを行える基盤エンジン。
単なる口調変換ではなく、キャラ固有の知識・記憶・性格に基づいた応答を実現する。

## セットアップ

### 前提条件

- Node.js 18 以上
- npm
- [OpenRouter](https://openrouter.ai/) の API キー

### インストール

```bash
git clone https://github.com/yoku8983/character-chat-lab.git
cd character-chat-lab
npm install
```

### 環境変数の設定

`.env.example` をコピーして `.env.local` を作成し、API キーを設定します。

```bash
cp .env.example .env.local
```

`.env.local` を編集して、OpenRouter の API キーを設定してください。

```
OPENROUTER_API_KEY=your_api_key_here
```

API キーは [OpenRouter Keys](https://openrouter.ai/keys) から取得できます。

#### 任意の環境変数

`.env.example` にコメント付きで記載しています（すべて任意）。

| 変数 | 既定 | 用途 |
|------|------|------|
| `CHAT_MAX_HISTORY_MESSAGES` | 30 | LLM に送る会話履歴の上限メッセージ数（コスト抑制）。system + few-shot は常に保持 |
| `CHAT_TEMPERATURE` | 未設定 | チャットの temperature（0〜2）。未設定でプロバイダ既定 |
| `EVAL_JUDGE_MODEL` | `google/gemini-3.1-flash-lite` | 評価 CLI（`npm run eval`）の LLM-as-Judge モデル |

### 起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

## 認証

本アプリは単一のパスワード（共有シークレット）による簡易認証を備えています。

- **仕組み**: 環境変数 `AUTH_SECRET` に設定したパスワードでログイン（`/login`）すると、Cookie（有効期限30日）が発行され、以降はブラウザ全体がその Cookie で認証済み扱いになります。ユーザー名やアカウントの概念はなく、パスワードを知っている人は誰でも同じ1ユーザーとして使えます
- **ローカル開発**: `AUTH_SECRET` が未設定なら認証は無効化され、従来どおりログインなしで使えます
- **本番**: `AUTH_SECRET` は必須です。未設定のままデプロイすると、全リクエストが `503` で遮断されます（フェイルクローズ。「認証なしで丸裸公開」より安全側に倒す設計）
- **パスワードの決め方**: 推測されない十分な長さのランダム文字列にしてください。`openssl rand -base64 32` などで生成することを推奨します（短い単語・辞書に載っているような語は不可）
- **パスワードを変更した場合**: 発行済みの Cookie はすべて無効になり、全ブラウザで再ログインが必要になります

## 使い方

### チャット対話モード

1. ヘッダーからキャラクターを選択
2. 使用モデルを選択（デフォルト: DeepSeek V4 Flash）
3. テキストボックスにメッセージを入力して送信
4. キャラクターがストリーミングで応答します
5. 左サイドバーに会話が自動保存されます
6. ページをリロードしてもサイドバーから過去の会話を復元できます

### 口調変換モード

1. ヘッダーの「口調変換」ボタンをクリック
2. 左側のテキストエリアに変換したい文章を入力
3. 矢印ボタンをクリックして変換
4. 右側に変換結果が表示されます
5. 「コピー」ボタンでクリップボードにコピーできます
6. 「クリア」ボタンで入力・結果をリセットして再入力できます

### エピソード記憶

ヘッダーの「記憶」ボタンから記憶パネルを開けます。

- **会話から抽出**: 現在の会話から重要な情報を LLM が自動抽出して記憶に保存
- **手動追加**: 任意の記憶を手動で追加可能
- **重要度管理**: 各記憶に 1-10 の重要度を設定（高い記憶ほど優先的に会話に反映）
- **編集・削除**: 記憶の内容や重要度を後から変更可能

記憶はペルソナごとに管理され、次回以降の会話のシステムプロンプトに自動注入されます。

> 会話から記憶を抽出する際、既存の記憶と重複する内容は登録されません。

### 利用状況（コスト・トークン）の確認

`/usage` ページ（ヘッダーの「利用状況」リンク、例: http://localhost:3000/usage ）で、OpenRouter API の実測 usage を確認できます。今日/今月/累計のサマリカードと日別（直近30日・JST基準）/月別のコスト集計を表示し、金額は USD と円換算（環境変数 `USD_JPY_RATE`、既定155）を併記します。

- モデル別の呼び出し数・トークン数・コスト・キャッシュヒット率
- 日別（直近30日）・月別のコスト集計

チャット・口調変換・記憶抽出の各呼び出しが自動で記録されます。

### ペルソナ管理

ヘッダーの「ペルソナ管理」タブから Web UI でペルソナを管理できます。

- **新規作成**: 全フィールド（性格・背景・話し方・知識・記憶・制約・会話例）を入力
- **編集**: 既存ペルソナの全フィールドを編集
- **削除**: 不要なペルソナを削除（最後の1つは削除不可）
- **フォーム / JSON 切替**: フォーム入力のほか、JSON を直接編集して登録も可能
- **リセット**: 入力内容を初期状態に戻すリセットボタン付き

## ペルソナの追加方法

### Web UI から追加（推奨）

「ペルソナ管理」タブから新規作成できます。

### YAML ファイルで追加

`personas/` ディレクトリに YAML ファイルを追加することもできます。アプリ起動時に自動で DB に同期されます。

```yaml
id: "unique-slug"        # 一意のID（英数字・ハイフン）
name: "表示名"            # UIに表示される名前

identity:
  personality: |
    性格の詳細記述
  background: |
    キャラクターの来歴
  point_in_time: "物語上のどの時点か"  # 任意: 時系列混在によるハルシネーション防止
  speaking_style:
    first_person: "俺"           # 一人称
    tone: "casual"               # トーン
    sentence_endings: ["ぜ"]     # 特徴的な語尾
    catchphrases: ["やれやれ"]    # 口癖
    vocabulary_notes: ""         # 語彙の特徴

knowledge:
  domains:
    - topic: "トピック名"
      content: |
        キャラクター固有の知識

memory:
  type: "static"
  entries:
    - "記憶エントリ"

behavior:
  constraints:
    - "行動制約"

# 任意: ユーザーはキャラにとって誰か（会話相手の既定値）
user_role: "プロデューサー"

# 任意: 主要人物への呼び方・態度
relationships:
  - name: "相手の名前"
    address_as: "呼び方"
    attitude: "態度・距離感"

examples:
  - user: "こんにちは"
    assistant: "応答例"

# 任意: こう応答してはいけない「悪い例」。
# システムプロンプトに否定文脈で注入され、崩れやすい応答を抑制する。
anti_examples:
  - user: "自己紹介して"
    assistant: "崩れた口調の悪い応答例"
```

### 生成AIチャットで JSON を作成して追加

Claude や ChatGPT などの生成AIチャットにキャラクター情報の生成を依頼し、出力された JSON をダッシュボードに貼り付けて登録できます。DeepResearch やWeb検索が使えるモデルなら、公式情報を調べた上で精度の高いペルソナを自動生成できます。

#### 手順

1. 以下のプロンプトをコピーし、Claude / ChatGPT などに投入する
2. `{キャラ名}` を作りたいキャラクターの名前に置き換える
3. 生成された JSON をコピーする
4. ダッシュボードの「ペルソナ管理」→「+ 新規作成」→「**JSON**」タブに切り替え
5. JSON を貼り付けて「**保存**」をクリック

> **Tips**
> - DeepResearch 対応モデル（Claude など）を使う場合、プロンプト冒頭に「Webで公式Wiki・ファンサイト・原作資料を調査した上で」と追記すると精度が上がります
> - オリジナルキャラの場合はWeb検索不要です。プロンプト内の「Webで公式情報を調べ」を削除し、代わりに箇条書きで設定を渡してください
> - `id` フィールドは不要です。UI が `name` から自動生成します

#### プロンプト例

```
あなたはキャラクター設定の専門家です。
以下のJSON形式に従って、「{キャラ名}」のペルソナ定義を作成してください。

可能であればWebで公式情報を調べ、以下を正確に反映してください：
- 性格・人柄
- 経歴・背景設定
- 一人称、口調、語尾の癖、口癖
- 専門知識・得意分野
- 行動原則や守るべきルール
- 実際の台詞に近い会話例（3〜5組）
- 主要な登場人物への呼び方・態度（relationships）
- 物語上のどの時点のキャラかの明示（point_in_time）と、ユーザーは誰として会話するか（user_role）

## 出力フォーマット（JSON）

{
  "name": "キャラクターの表示名",
  "identity": {
    "personality": "性格を2〜3文で",
    "background": "経歴・背景を3〜5文で",
    "point_in_time": "物語上のどの時点のキャラか（1文。例: ○○編終了直後）",
    "speaking_style": {
      "first_person": "一人称",
      "tone": "口調を英語ハイフン区切りで（例: calm-intellectual）",
      "sentence_endings": ["特徴的な語尾を3〜5個"],
      "catchphrases": ["口癖や決め台詞を3〜5個"],
      "vocabulary_notes": "語彙や言い回しの特徴を自由記述"
    }
  },
  "knowledge": {
    "domains": [
      {
        "topic": "専門分野名",
        "content": "その分野についてキャラが持つ知識（2〜3文）"
      }
    ]
  },
  "memory": {
    "type": "static",
    "entries": [
      "キャラにとって重要な記憶や出来事（1エントリ1文、3〜5個）"
    ]
  },
  "behavior": {
    "constraints": [
      "キャラが絶対にしないこと、守るルール（3〜5個）"
    ]
  },
  "user_role": "ユーザーはキャラにとって誰か（例: 部下、ファン、初対面の客）",
  "relationships": [
    {
      "name": "主要人物の名前",
      "address_as": "その人物への呼び方",
      "attitude": "その人物への態度・距離感（1文）"
    }
  ],
  "examples": [
    {
      "user": "ユーザーの質問や発言",
      "assistant": "キャラらしい応答（口調・語尾を忠実に再現）"
    }
  ]
}

注意事項：
- JSON以外のテキストは出力しないでください
- 実在の人物の場合は公開情報のみを使用してください
- 語尾・口癖・一人称は原作や公式資料に忠実に
```

## 使用可能モデル (OpenRouter経由)

| モデル | 用途 | Input $/M | Output $/M |
|--------|------|-----------|------------|
| DeepSeek V4 Flash | デフォルト（コスパ最強） | $0.09 | $0.18 |
| DeepSeek V4 Pro | 高品質モード | $0.435 | $0.87 |
| Gemini 3.1 Flash Lite | センシティブ情報用 | $0.25 | $1.50 |
| Grok 4.3 | 高品質＋低レイテンシ | $1.25 | $2.50 |

## 品質評価・コスト計測（開発者向け）

口調ドリフトと応答品質を定量評価する CLI ハーネスを同梱しています（`scripts/eval/`）。詳細は [Issue #20 仕様書](docs/issue20-improvements-spec.md) を参照。

```bash
# 単一構成（persona × model × temperature）でマルチターン評価
npm run eval -- --persona <id>

# 複数モデル × temperature を一括比較
npm run eval:sweep -- --persona <id>

# 2 つのレポート JSON の品質・コスト差分を表示
npm run eval:compare -- <report-a.json> <report-b.json>
```

- 口調ドリフト: 一人称・語尾・口癖のマーカーを会話の前半／後半で比較
- LLM-as-Judge: 被評価モデルと別系統のモデルで tone / knowledge / persona / naturalness を採点
- 実測コストはレポートに記録され、`/usage` ページでも集計を確認できます

### 評価コンソール（ローカル専用）

上記の CLI 評価をブラウザから実行・進捗確認・履歴閲覧できる GUI（`/eval` ページ）を同梱しています。
環境変数 `EVAL_UI_ENABLED` を `"1"` にした場合のみ有効になるローカル専用機能で、未設定時は本番同様
404 になります（本番環境変数には設定しないこと）。

```bash
EVAL_UI_ENABLED=1 npm run dev
```

http://localhost:3000/eval を開くと、多ターン評価・知識クイズの実行フォーム、実行中の進捗表示と中断、
過去レポートの一覧・詳細表示が使えます。ヘッダーの「評価」リンク（`EVAL_UI_ENABLED` 有効時のみ表示）
からも遷移できます。

さらに、実行履歴からレポートを「ベースラインに設定」しておけば、以降は「回帰チェック」セクションの
ワンボタン実行で同一構成の再評価を走らせ、ベースラインと比較した PASS / FAIL 判定を確認できます
（品質回帰の継続チェック）。詳細は [scripts/eval/README.md](scripts/eval/README.md) の「品質回帰チェッ
クの運用」を参照。

## アーキテクチャ

```
[フロント層]  Next.js Web UI (チャット / 口調変換 / ペルソナ管理)
     ↓
[コアエンジン]  ペルソナ読込 → プロンプト組立(+記憶注入) → LLM呼出 → 応答整形
     ↓
[LLM層]      OpenRouter API → モデル選択・ルーティング
     ↓
[データ層]    libSQL/Turso (会話・記憶・ペルソナ) + YAML (初期ペルソナ定義)
```

## 技術スタック

- Next.js 15 (TypeScript) — フロント + API Routes
- Tailwind CSS v4 — スタイリング
- Noto Sans JP (Google Fonts) — 日本語フォント
- libSQL / [Turso](https://turso.tech/) — 会話・記憶・ペルソナの永続化（ローカルはファイル DB、本番は Turso クラウド）
- OpenRouter API (OpenAI互換) — LLMバックエンド
- YAML — ペルソナ初期定義ファイル
- Docker — コンテナ化（Azure Container Apps 向け）

## デプロイ

### ローカル開発（従来通り）

1. `cp .env.example .env.local` して API キーを設定
2. `npm install`
3. `npm run dev` → http://localhost:3000
4. データは `./data/chat-lab.db` に自動保存（libSQL ファイルモード）

### Azure Container Apps（無料）にデプロイ

本アプリは Azure Container Apps（Consumption / スケールゼロ）+ Turso で、**月額 ¥0**（無料枠内）で動作します。

詳しい手順は [Azure デプロイガイド](docs/azure-deployment.md) を参照。

**ざっくりした流れ:**

1. [Turso](https://turso.tech/) でデータベースを作成（無料プラン: 5GB）
2. Azure Portal で Container App を作成（Consumption / Japan East / min-replicas=0）
3. 環境変数を設定:
   - `OPENROUTER_API_KEY` = あなたの API キー
   - `LIBSQL_URL` = `libsql://your-db.turso.io`
   - `LIBSQL_AUTH_TOKEN` = Turso の認証トークン
4. GitHub Actions の Secrets / Variables を設定
5. `main` ブランチに push → 自動デプロイ

**コスト:**

| 項目 | 月額 |
|---|---|
| Container Apps (Consumption) | ¥0（無料枠: 180K vCPU-sec） |
| Turso (Free) | ¥0（5GB / 500M reads） |
| GHCR | ¥0（Public repo） |
| **合計** | **¥0** |

**制約:**
- 無リクエスト時 → レプリカ 0（課金ゼロ）、次アクセス時コールドスタート（5-15秒）
- 超過時: 1チャットあたり約 ¥0.04

## ドキュメント

- [MVP1 仕様書](docs/mvp1-spec.md) — MVP1 機能・アクセプタンス基準
- [MVP2 仕様書](docs/mvp2-spec.md) — MVP2 機能・アクセプタンス基準
- [Issue #20 仕様書](docs/issue20-improvements-spec.md) — コンテキスト戦略・コスト最適化（usage 計測・履歴上限・評価基盤・キャッシュ最適化）
- [ロードマップ](docs/roadmap.md) — 拡張計画
- [Azure デプロイガイド](docs/azure-deployment.md) — Azure Container Apps + Turso セットアップ手順
- [ホスティング・コスト分析](docs/hosting-cost-analysis.md) — AWS / Azure 構成比較・コスト試算
