# 設計書: 共有シークレット認証（Issue #42）

- 日付: 2026-07-04
- 対象 Issue: #42「本番の全 API エンドポイント（17 route）が無認証で公開されている」
- ステータス: ユーザー承認済み

## 背景と目的

本番デプロイ（Azure Container Apps、インターネット公開）の全 API・全ページが無認証で、URL を知る第三者に (1) OpenRouter 課金の悪用、(2) ペルソナ・会話ログ・記憶の閲覧/改ざん/削除、(3) コスト情報の閲覧、を許してしまう。

個人利用（ユーザー 1 人）のアプリなので、マルチユーザー認証はオーバーキル。**環境変数に置いた合言葉（共有シークレット）を初回にログインページで入力させ、以後は Cookie で通す**最小構成で全体を守る。

## 決定事項（ユーザー確定）

- 方式: **案 1・共有シークレット + 自作ログインページ**（Basic 認証ダイアログは不採用。スマホ相性・見た目・Cookie 寿命制御のため）
- ログインページはスマホ/PC 両対応。デザインはシンプルで良い（中央カード 1 枚）
- ログアウト機能は作らない（YAGNI。必要になったら Cookie 削除で足りる）

## コンポーネント設計

### 1. 環境変数 `AUTH_SECRET`

- 合言葉。`.env.example` に空欄 + コメント（長いランダム文字列を推奨、例の生成コマンド付き）で追記。本番は Azure Container Apps の環境変数に設定
- **フェイルクローズ**: `NODE_ENV === "production"` で未設定なら、middleware が全リクエストを 503（日本語メッセージ）で遮断。「設定し忘れて丸裸」を構造的に防ぐ
- ローカル開発（production 以外）で未設定なら認証をスキップ（従来どおりの開発体験）。設定されていれば開発でも認証が働く（動作確認用）

### 2. `lib/auth.ts`（ヘルパ・純粋関数中心）

- `sha256Hex(input: string): Promise<string>` — Web Crypto（`crypto.subtle`）ベース。middleware が Edge ランタイムで動くため Node の `crypto` は使わない
- `timingSafeEqualStr(a: string, b: string): boolean` — 長さ不一致でも早期 return しない定数時間比較
- `AUTH_COOKIE_NAME = "auth_token"`、`AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60`（30 日）
- Cookie に入れる値は **`AUTH_SECRET` の SHA-256 hex**（パスワード生値は Cookie に入れない）。`AUTH_SECRET` を変更すると全ブラウザの Cookie が自動失効する

### 3. `middleware.ts`（新設・防御の本体）

- 対象: 全ページ・全 API。除外（matcher + コード内チェック）:
  - `/login`、`/api/auth/login`
  - `/_next/*`（静的アセット・RSC ペイロード配信）、`/favicon.ico` 等の静的ファイル
- ロジック:
  1. `AUTH_SECRET` 未設定: production → 503「サーバーの認証設定が未完了です（AUTH_SECRET 未設定）」/ それ以外 → 素通し
  2. Cookie `auth_token` が `sha256Hex(AUTH_SECRET)` と一致（定数時間比較）→ 素通し
  3. 不一致・欠落: パス が `/api/` 始まり → 401 JSON `{ error: "認証が必要です" }` / それ以外（ページ）→ `/login?from=<元のパス>` へリダイレクト
- 既存の `/api/eval/*` の `EVAL_UI_ENABLED` 404 ガードは**そのまま残す**（二重の防御。本認証は追加レイヤーであり既存ガードを置き換えない）

### 4. `app/api/auth/login/route.ts`

- POST body `{ password: string }`:
  1. `AUTH_SECRET` 未設定: production → 503（middleware と同文言）/ 開発 → 400「開発環境では AUTH_SECRET が未設定のため認証は無効です」
  2. body 不正・password 非文字列 → 400「合言葉を入力してください」
  3. `timingSafeEqualStr(password, AUTH_SECRET)` で照合。**失敗時は約 500ms 遅延してから** 401「合言葉が違います」（総当たりを鈍らせる。回数ロックは 1 人用なので作らない）
  4. 成功: `Set-Cookie: auth_token=<sha256Hex(AUTH_SECRET)>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`（production では `Secure` 付与）→ 200 `{ ok: true }`
- この route 自体は middleware の除外対象（未認証で叩けないと意味がない）

### 5. `app/login/page.tsx`

- シンプルな中央カード: 見出し「合言葉を入力してください」+ `type="password"` 入力欄 + 「入室」ボタン + エラー表示領域
- スマホ/PC 両対応: `min-h-screen flex items-center justify-center px-4` + カードは `w-full max-w-sm`。色は既存 CSS 変数（`var(--bg-primary)` / `var(--bg-secondary)` / `var(--text-primary)` / `var(--border)` / `var(--accent)`）、エラーは `#e05252`
- 成功時: `?from=` クエリ（あれば・`/` 始まりのパスのみ許可＝オープンリダイレクト防止）へ遷移、なければ `/` へ
- 失敗時: API の日本語エラーを表示。送信中はボタン disabled
- 認証済みで `/login` に来た場合の特別処理はしない（再入力しても害なし。YAGNI）

## セキュリティ上の注意（実装者向け）

- `AUTH_SECRET`・Cookie 値をログ出力しない
- 比較は必ず定数時間比較を使う（`===` 直接比較は不可）
- Cookie は `HttpOnly`（JS から読めない）+ `SameSite=Lax`（CSRF の基本緩和）+ production では `Secure`
- `from` パラメータは `/` 始まりの相対パスのみ許可（`//evil.com` や `https://` を弾く）

## エラーハンドリングまとめ

| 状況 | 挙動 |
|---|---|
| 本番で AUTH_SECRET 未設定 | 全リクエスト 503（日本語） |
| 開発で AUTH_SECRET 未設定 | 認証スキップ（従来どおり） |
| 未認証でページアクセス | `/login?from=<path>` へリダイレクト |
| 未認証で API アクセス | 401 JSON（日本語） |
| 合言葉間違い | 約 500ms 遅延 + 401「合言葉が違います」 |

## ドキュメント

- `README.md`: セットアップ手順に `AUTH_SECRET` を追記（推奨: `openssl rand -base64 32` 等で生成した長いランダム文字列）。本番（Azure）への設定手順・「未設定だと本番は 503 になる」ことを明記
- `.env.example`: `AUTH_SECRET=` + コメント
- デプロイ関連ドキュメント（`docs/` 配下にあれば）の環境変数一覧を更新
- Issue #42 はマージ後にクローズ（対応内容をコメント）

## テスト・検証方針（既存流儀を踏襲）

- `lib/auth.ts` の純粋関数（`sha256Hex` 既知ベクタ・`timingSafeEqualStr` 一致/不一致/長さ違い）は tsx ワンオフで検証（コミットしない）
- curl e2e（dev サーバー、`AUTH_SECRET` 設定あり）:
  - 未認証: `GET /` → `/login` へリダイレクト、`GET /api/personas` → 401
  - `POST /api/auth/login` 誤パスワード → 401（応答時間 ≥ 500ms）、正パスワード → 200 + Set-Cookie
  - Cookie 付きで `GET /` 200・`GET /api/personas` 200・チャット 1 往復
  - `/login`・`/api/auth/login`・`/_next/*` は未認証でも到達可能
  - `from=//evil.com` が `/` にフォールバックすること（ページ実装のロジック確認）
- `AUTH_SECRET` 未設定 + `NODE_ENV=production`（`npx next build` + `npx next start` で確認）→ 503。未設定 + dev → 従来どおり全機能動作（回帰確認）
- ブラウザ相当の確認: ログインページの HTML がスマホ幅/PC 幅両方で崩れない構造（max-w カード）であること
- `npx tsc --noEmit`、`npx next build`（dev 停止後、build 後 `rm -rf .next`）

## 変更ファイル一覧（見込み）

| ファイル | 変更 |
|---|---|
| `middleware.ts` | 新設（リポジトリルート） |
| `lib/auth.ts` | 新設 |
| `app/api/auth/login/route.ts` | 新設 |
| `app/login/page.tsx` | 新設 |
| `.env.example` / `README.md` / デプロイ文書 | 追記 |
| `PROGRESS.md` | 完了メモ |

既存コードの変更なし（純追加）。既存 UI・API の挙動は「認証を通った後」は完全に従来どおり。
