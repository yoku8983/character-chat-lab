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

### 起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

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

examples:
  - user: "こんにちは"
    assistant: "応答例"
```

## 使用可能モデル (OpenRouter経由)

| モデル | 用途 | Input $/M | Output $/M |
|--------|------|-----------|------------|
| DeepSeek V4 Flash | デフォルト（コスパ最強） | $0.09 | $0.18 |
| DeepSeek V4 Pro | 高品質モード | $0.435 | $0.87 |
| Gemini 3.1 Flash Lite | センシティブ情報用 | $0.25 | $1.50 |
| Grok 4.3 | 高品質＋低レイテンシ | $1.25 | $2.50 |

## アーキテクチャ

```
[フロント層]  Next.js Web UI (チャット / 口調変換 / ペルソナ管理)
     ↓
[コアエンジン]  ペルソナ読込 → プロンプト組立(+記憶注入) → LLM呼出 → 応答整形
     ↓
[LLM層]      OpenRouter API → モデル選択・ルーティング
     ↓
[データ層]    SQLite (会話・記憶・ペルソナ) + YAML (初期ペルソナ定義)
```

## 技術スタック

- Next.js 15 (TypeScript) — フロント + API Routes
- Tailwind CSS v4 — スタイリング
- Noto Sans JP (Google Fonts) — 日本語フォント
- SQLite (better-sqlite3) — 会話・記憶・ペルソナの永続化
- OpenRouter API (OpenAI互換) — LLMバックエンド
- YAML — ペルソナ初期定義ファイル

## ドキュメント

- [MVP1 仕様書](docs/mvp1-spec.md) — MVP1 機能・アクセプタンス基準
- [MVP2 仕様書](docs/mvp2-spec.md) — MVP2 機能・アクセプタンス基準
- [ロードマップ](docs/roadmap.md) — 拡張計画
