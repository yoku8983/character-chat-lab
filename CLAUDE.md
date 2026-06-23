# CLAUDE.md — character-chat-lab

## プロジェクト概要
AIキャラクターの人格・口調・固有知識・長期記憶を定義し、深いレベルでの疑似会話や口調変換を行うWebアプリ。

## 開発ルール

### 最優先ルール
- OpenRouter API キーは絶対にクライアントサイドに露出させない（API Routes 経由のみ）
- ペルソナ定義に個人情報・パスワード・API キー等のセンシティブ情報を含めない
- サンプルペルソナに実在の人物の名前を使わない

### 技術スタック（固定）
- Next.js (TypeScript)
- OpenRouter API（OpenAI 互換）
- ペルソナ定義: YAML or JSON ファイル（`personas/` ディレクトリ）

### コーディング規約
- TypeScript strict mode
- コンポーネントは関数コンポーネント + Hooks
- API Routes は App Router (`app/api/`)
- 環境変数は `.env.local` に記述、`.env.example` をコミット

### 開発時の注意事項
- `npx next build` を実行する前に、dev サーバー (`next dev`) を必ず停止すること。dev サーバーが古い `.next` を掴んだまま build が上書きすると、`Cannot find module './XXX.js'` ランタイムエラーが発生する
- build 後に dev サーバーを再起動する場合は `.next` を削除してからにすること (`rm -rf .next`)

### 仕様書の場所
- MVP1 の仕様・DONE 定義: `docs/mvp1-spec.md`
- MVP2 の仕様・DONE 定義: `docs/mvp2-spec.md`
- ロードマップ: `docs/roadmap.md`

## 現在のフェーズ
MVP2 完了。改善・バグ修正フェーズ。
