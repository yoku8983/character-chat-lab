# ロードマップ: character-chat-lab

## MVP1 — 基盤（完了）
Web チャット + 口調変換。ペルソナ定義をファイルベースで管理。

## MVP2 — 記憶と深化（完了）
- 会話履歴の永続化（SQLite）
- エピソード記憶: 会話から重要情報を LLM で抽出し、次回以降の会話に自動注入
- ペルソナエディタ: Web UI からペルソナを作成・編集・削除（フォーム + JSON 2モード対応）
- UI/UX 改善: Noto Sans JP フォント、口調変換クリアボタン、中華モデル警告

## 改善フェーズ — コンテキスト戦略・コスト最適化（Issue #20, 完了）
計測ファーストで、コンテキスト戦略とコストを実測ベースで最適化。詳細は [Issue #20 仕様書](issue20-improvements-spec.md)。
- usage 実測ログ基盤（`/usage` ページでモデル別・日別コスト／キャッシュヒット率を可視化）
- 会話履歴の上限管理（`CHAT_MAX_HISTORY_MESSAGES`、既定 30）
- 記憶抽出の重複防止
- 評価基盤（`npm run eval` 系。口調ドリフト検出 + LLM-as-Judge）
- モデル/temperature の実験 → DeepSeek V4 Flash + プロバイダ既定 temperature の維持を実測で決定
- ペルソナ品質改善（anti_examples フィールド、YAML 再シードの content_hash 差分更新）
- プロンプト構造のキャッシュ最適化（静的→可変→指示の順に再配置）

## MVP3 — 外部連携
- LINE Bot 連携
- Slack Bot 連携
- Claude Code Skill 化（スキル呼び出しでキャラ対話モード ON）

## MVP4 — 特徴抽出パイプライン
- X (Twitter) 投稿 CSV → 口調特徴の自動抽出 → ペルソナ定義の自動生成
- 任意テキスト群 → スタイル分析 → ペルソナ化
  - 例: Jリーグ公式プレス文の特徴抽出

## 将来構想
- ペルソナのポータビリティ（Claude Code / 他フレームワークへの移植可能な形式）
- 複数ペルソナ間の対話シミュレーション
- Note での技術記事・ノウハウの有料公開
