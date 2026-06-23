# MVP2 仕様書: 記憶と深化

## 概要

MVP1（チャット対話 + 口調変換）の上に3つの機能を追加し、キャラクターとの継続的な対話体験を実現する。

## 機能一覧

### 1. 会話履歴の永続化

SQLite に会話セッション・メッセージを保存し、ページリロード後も復元可能にする。

**仕様:**
- 初回メッセージ送信時にセッションを自動作成（空セッション防止）
- セッションタイトルは最初のユーザーメッセージから自動生成（50文字で切り詰め）
- 左サイドバーにセッション一覧を表示（タイトル・メッセージ数・経過時間）
- セッション選択で会話を復元
- 「新規会話」ボタンでセッションをクリア
- セッション削除は確認ダイアログ付き

**DONE 定義:**
- [x] メッセージが DB に保存される
- [x] ページリロード後にサイドバーからセッションを選んで会話が復元される
- [x] 新規会話ボタンが動作する
- [x] セッション削除が動作する
- [x] セッションタイトルが自動生成される

### 2. エピソード記憶

会話から重要な情報を LLM で抽出し、将来の会話に自動注入する。

**仕様:**
- 記憶パネル: ヘッダーの「記憶」ボタンで右スライドパネルを開閉
- 抽出: 直近20メッセージを LLM に送り、`{content, importance}[]` を JSON で返却
- 手動追加: 任意の記憶テキストを手動で追加可能
- 編集: 記憶の内容・重要度（1-10 スライダー）をインライン編集
- 削除: 確認ダイアログ付き
- 注入: 重要度上位20件をシステムプロンプトの「エピソード記憶」セクションに自動注入
- ペルソナごとに記憶を分離管理

**DONE 定義:**
- [x] 記憶パネルが開閉する
- [x] 会話から記憶が抽出される
- [x] 手動で記憶を追加できる
- [x] 記憶を編集・削除できる
- [x] 記憶がシステムプロンプトに注入される
- [x] 記憶バッジにカウントが表示される

### 3. ペルソナエディタ

Web UI からペルソナを作成・編集・削除する。

**仕様:**
- ペルソナ一覧: カードグリッドで表示（名前・性格スニペット・編集/削除ボタン）
- 新規作成: 全フィールド入力フォーム
- 編集: 既存ペルソナの全フィールドを編集
- 削除: 最後の1件は削除不可（ガード付き）
- YAML 由来ペルソナも DB 経由で編集可能（起動時に YAML→DB 同期）
- ID は名前から自動生成
- フォーム / JSON の2モード切替（JSON モードではペルソナ定義を直接編集可能）
- JSON モードにはキー凡例（折りたたみ式）を表示
- リセットボタン: フォームモードでは入力内容を初期化、JSON モードでは初期 JSON テンプレートに復元

**フォーム構成:**
- 基本情報: 名前
- 性格・背景: textarea
- 話し方: 一人称、トーン、語尾（タグ入力）、口癖（タグ入力）、語彙特徴
- 固有知識: topic + content ペア（動的追加/削除）
- 静的記憶: エントリリスト（動的追加/削除）
- 行動制約: リスト（動的追加/削除）
- 会話例: user + assistant ペア（動的追加/削除）

**DONE 定義:**
- [x] ペルソナ一覧が表示される
- [x] 新規ペルソナを作成してチャットで使える
- [x] 既存ペルソナを編集できる
- [x] ペルソナを削除できる（最後の1件は削除不可）
- [x] フォーム / JSON モードを自由に切り替えられる
- [x] JSON モードのキー凡例が表示される
- [x] リセットボタンで入力を初期化できる

## 技術構成

### DB スキーマ (SQLite)

```sql
sessions (id TEXT PK, persona_id, model_id, title, created_at, updated_at)
messages (id INTEGER PK, session_id FK, role, content, created_at)
memories (id INTEGER PK, persona_id, content, importance 1-10, source_session_id, created_at)
personas (id TEXT PK, name, definition JSON, source 'yaml'|'db', created_at, updated_at)
```

### API エンドポイント

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/sessions` | セッション一覧（?personaId フィルタ） |
| POST | `/api/sessions` | セッション作成 |
| GET | `/api/sessions/[id]` | セッション + メッセージ取得 |
| PATCH | `/api/sessions/[id]` | タイトル更新 |
| DELETE | `/api/sessions/[id]` | セッション削除 |
| POST | `/api/sessions/[id]/messages` | メッセージ追加 |
| GET | `/api/memories` | 記憶一覧（?personaId） |
| POST | `/api/memories` | 記憶手動追加 |
| PATCH | `/api/memories/[id]` | 記憶更新 |
| DELETE | `/api/memories/[id]` | 記憶削除 |
| POST | `/api/memories/extract` | LLM 記憶抽出 |
| GET | `/api/personas` | ペルソナ一覧 |
| POST | `/api/personas` | ペルソナ作成 |
| GET | `/api/personas/[id]` | ペルソナ詳細 |
| PUT | `/api/personas/[id]` | ペルソナ更新 |
| DELETE | `/api/personas/[id]` | ペルソナ削除 |

### ファイル構成（新規・変更）

```
lib/
  db.ts              — SQLite 接続シングルトン、スキーマ初期化
  db-personas.ts     — ペルソナ CRUD + YAML 同期
  db-sessions.ts     — セッション CRUD
  db-messages.ts     — メッセージ永続化 + タイトル自動生成
  db-memories.ts     — 記憶 CRUD
  memory-extraction.ts — LLM 記憶抽出ロジック

components/
  SessionSidebar.tsx — セッション一覧サイドバー
  MemoryPanel.tsx    — 記憶管理スライドパネル
  PersonaList.tsx    — ペルソナ一覧カード
  PersonaEditor.tsx  — ペルソナ作成/編集フォーム（フォーム + JSON 2モード対応）
  ConfirmDialog.tsx  — 汎用確認ダイアログ
```

## UI/UX 改善（MVP2 後の追加改修）

### 口調変換クリアボタン
- 変換実行ボタンの下にクリアボタンを配置
- 入力テキスト・変換結果を一括リセット
- 入力も結果もない or 変換中は disabled 表示（常時表示）

### フォント
- Noto Sans JP (Google Fonts) を全体に適用
- Tailwind v4 の `--font-sans` CSS 変数でオーバーライド

### 中華モデル警告
- DeepSeek 系モデル選択時、チャット画面・口調変換画面に個人情報入力注意の警告バナーを表示
