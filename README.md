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

### 口調変換モード

1. ヘッダーの「口調変換」ボタンをクリック
2. 左側のテキストエリアに変換したい文章を入力
3. 矢印ボタンをクリックして変換
4. 右側に変換結果が表示されます
5. 「コピー」ボタンでクリップボードにコピーできます

## ペルソナの追加方法

`personas/` ディレクトリに YAML ファイルを追加することで、新しいキャラクターを追加できます。

### 最低限必要なフィールド

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

ファイルを追加したらアプリを再読み込みするだけで反映されます。

## 使用可能モデル (OpenRouter経由)

| モデル | 用途 | Input $/M | Output $/M |
|--------|------|-----------|------------|
| DeepSeek V4 Flash | デフォルト（コスパ最強） | $0.09 | $0.18 |
| DeepSeek V4 Pro | 高品質モード | $0.435 | $0.87 |
| Gemini 3.1 Flash Lite | センシティブ情報用 | $0.25 | $1.50 |
| Grok 4.3 | 高品質＋低レイテンシ | $1.25 | $2.50 |

## アーキテクチャ

```
[フロント層]  Next.js Web UI (チャット / 口調変換)
     ↓
[コアエンジン]  ペルソナ定義読込 → プロンプト組立 → LLM呼出 → 応答整形
     ↓
[LLM層]      OpenRouter API → モデル選択・ルーティング
     ↓
[データ層]    ペルソナ定義ファイル (YAML/JSON)
```

## 技術スタック

- Next.js 15 (TypeScript) — フロント + API Routes
- Tailwind CSS v4 — スタイリング
- OpenRouter API (OpenAI互換) — LLMバックエンド
- YAML — ペルソナ定義ファイル

## ドキュメント

- [MVP1 仕様書](docs/mvp1-spec.md) — 機能・アクセプタンス基準・設計方針
- [ロードマップ](docs/roadmap.md) — MVP1 以降の拡張計画
