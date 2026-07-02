# PROGRESS.md — character-chat-lab

> 最終更新: 2026-07-02（Fable 5 セッションからの引継ぎ文書を兼ねる）

## 現在地

- MVP1・MVP2 完了。Azure Container Apps 本番デプロイ済み（libSQL/Turso + スケールゼロ）
- 現在は **Issue #20「ペルソナデータ設計・コンテキスト戦略・コスト最適化の総合改善」** の実装フェーズ入口
- Issue #20 は 2026-07-02 に全面改訂済み。旧 Deep Research 由来の設計は破棄され、コードベース実査に基づく分析と対策タスク T1〜T7 に置き換わっている。**Issue #20 本文が唯一の正**（この文書はポインタと実装メモのみ）

## 次にやること（Issue #20 のタスク、優先順）

1. ~~**T1: usage 実測ログ基盤**（最高）~~ ✅ 完了（`feat/t1-usage-log`。詳細は末尾「完了済み」）
2. ~~**T2: 会話履歴の上限管理**（最高）~~ ✅ 完了（`feat/t2-history-cap`。詳細は末尾「完了済み」）
3. ~~**T3: 記憶抽出の重複防止**（高）~~ ✅ 完了（`feat/t3-dedup-memory`。詳細は末尾「完了済み」）
4. T4: 評価基盤（multi-turn 必須・Judge は別系統モデル） ← 次はこれ
5. T5: モデル × temperature 実験
6. T6: ペルソナデータ品質改善 / T7: プロンプト構造のキャッシュ最適化
7. 動的コンテキスト選択は**封印**（解除条件は Issue #20 参照。実装しないこと）

タスクの詳細・チェックボックスは Issue #20 を参照し、完了したら Issue 側のチェックを更新すること。

## 実装メモ（設計分析セッションからの申し送り）

### T1 実装の要点
- ストリーミングで usage を得るには、OpenRouter リクエスト body に `usage: { include: true }` を追加する。usage は**最終 SSE チャンク**（choices が空 or 最後の data）に入る。`app/api/chat/route.ts` の現行パーサは `delta.content` 以外を読み捨てているので、`parsed.usage` を捕捉する処理を足す
- 取るべきフィールド: `prompt_tokens` / `completion_tokens` / `prompt_tokens_details.cached_tokens` / `cost`（あれば `cache_discount` も）
- `usage_log` テーブルは `lib/db.ts` の既存スキーマ初期化パターン（CREATE TABLE IF NOT EXISTS）に倣う。記録対象は chat / convert / memories/extract の 3 route
- **このログで Gemini 3.1 Flash Lite / Grok 4.3 のキャッシュ対応可否も判明する**（cached_tokens が返るか見るだけ。別途の調査は不要）

### T2 実装の要点
- クライアントは毎回全履歴を送ってくる。カットは**サーバ側**（chat route）で行う
- system プロンプト + few-shot はプレフィクスキャッシュの土台なので**常に維持**し、履歴の古い側から user/assistant ペア単位で落とす
- 上限は定数 or 環境変数で（初期値の目安: 直近 30 メッセージ程度。T1 のログを見て調整）

### T3 実装の要点
- `lib/memory-extraction.ts` の抽出プロンプトに既存記憶リスト（`listMemories`）を渡し、「既知の情報は再抽出しない」を明示指示
- 既存の重複データは記憶パネルから手動削除で足りるか確認し、足りなければ簡易クリーンアップを検討

### T4 実装の要点
- 単発 QA 評価では不足。**15〜20 ターンの multi-turn スクリプト会話**を流し、後半ターンの一人称・語尾出現率（正規表現）で口調ドリフトを検出する
- LLM-as-Judge は**被評価モデルと別系統の高性能モデル**を使う（DeepSeek を DeepSeek で審査しない）

### 一般的な注意
- `lib/models.ts` のモデル ID（deepseek-v4-flash 等）は 2026 年時点の実在モデル。古い知識で「存在しない」と誤判定しないこと
- ペルソナは `personas/*.yaml`（mira / tetsu-oyaji）+ DB。YAML はシード済みフラグ管理で再投入されない（T6 に content_hash 対策あり）
- ビルド前に dev サーバー停止、build 後の dev 再開は `.next` 削除から（プロジェクト CLAUDE.md 参照）

## 進め方のルール（このフェーズの運用）

- タスクごとにブランチを切って PR（main 直 push 禁止）。T1〜T3 は小さいので 1 タスク = 1 PR が目安
- 各 PR で: 実装 → 実アプリで動作確認（チャットを実際に叩いて usage_log に行が入る等を目視）→ 関連ドキュメント更新（docs/、この PROGRESS.md、必要なら CLAUDE.md の現在フェーズ）
- **実装中に設計レベルの想定外**（例: OpenRouter の usage が仕様どおり返らない、キャッシュ挙動が分析と異なる）が出たら: この PROGRESS.md に事実を記録し、独断で設計変更せず、設計レビュー用の Fable セッションに「小さく切り出した質問」として持ち込む
- モデル運用: メインセッション = Opus 4.8、探索・読み取り・機械的作業のサブエージェント = Sonnet / Haiku。Fable は設計判断の単発相談のみ

## 完了済み（直近）

- 2026-07-02: **T3 記憶抽出の重複防止 完了**（ブランチ `feat/t3-dedup-memory`）
  - `lib/memory-extraction.ts`: `extractMemories` に第4引数 `existingMemories: string[] = []` を追加。静的 `EXTRACTION_PROMPT` を先頭に維持し、既存記憶がある場合のみ「既にある記憶（重複抽出の禁止）」ブロックを後ろに動的付加（同一・言い換え・部分集合は抽出しない指示）
  - `app/api/memories/extract/route.ts`: `ensureDb()`→`listMemories` で既存記憶を取得してから抽出に渡すよう順序変更。さらに保険として addMemory ループ前に**完全一致の重複ガード**（trim 済み content の Set で既存＋バッチ内重複をスキップ）。usage 記録（T1）はそのまま維持
  - 既存重複データのクリーンアップ: 記憶パネル `components/MemoryPanel.tsx` に個別削除があり**手動削除で足りる**ことを確認（バルク削除ツールは YAGNI で不要）。Embedding 等の曖昧重複判定は封印どおり不実装
  - 検証: dev で同一会話に extract を 2 回実行 → 1 回目 3 件保存、2 回目 0 件（LLM が既存記憶を見て新情報なしと判断＝プロンプト方式が機能）、記憶件数は 3 のまま
- 2026-07-02: **T2 会話履歴の上限管理 完了**（ブランチ `feat/t2-history-cap`）
  - `lib/history.ts` 新設: `capMessageHistory(messages, maxMessages)` — 直近 N 件に丸め、カット後の履歴が user 発話始まりになるよう調整（user/assistant のペア境界を維持）
  - `app/api/chat/route.ts`: 環境変数 `CHAT_MAX_HISTORY_MESSAGES`（未設定・不正値なら既定 30）で上限を読み、apiMessages 構築時にカット適用。system プロンプト+few-shot は固定プレフィクスとして常に維持（キャッシュ整合のため並び・内容は不変）
  - `.env.example` に `CHAT_MAX_HISTORY_MESSAGES` を追記
  - 対象は chat route のみ。convert（単発 text）/ extract（独自 slice 済み）は対象外。古い履歴の要約注入は Issue #20 方針どおり未実施
  - 検証: 純粋関数を単体コンパイルして 9 ケース直接検証（上限以下は素通し／超過時の user・assistant 境界／最新保持／0・負・NaN）＋ dev で 59 件履歴の実送信で 200・キャラ応答・エラー無し
  - **申し送り**: カットは LLM 送信時のみで、クライアント表示（ChatView は全履歴保持）や DB 保存には影響しない。初期値 30 は T1 の usage ログを見て調整余地あり
- 2026-07-02: **T1 usage 実測ログ基盤 完了**（ブランチ `feat/t1-usage-log`）
  - `usage_log` テーブル新設（route / session_id / persona_id / model_id / prompt_tokens / completion_tokens / cached_tokens / cost / created_at）
  - chat / convert / memories/extract の 3 route で OpenRouter の usage を記録（リクエスト body に `usage: { include: true }`、ストリーム最終チャンクから捕捉。記録は try/catch で応答を止めない）
  - 集計: `GET /api/usage`（JSON）+ 管理 UI ページ `/usage`（モデル別・日別・全体サマリ・キャッシュヒット率）
  - **実測で判明した事実（DeepSeek V4 Flash）**:
    - `usage: { include: true }` で `prompt_tokens` / `completion_tokens` / `cost`（USD 実費と思われる生値）が返る
    - **DeepSeek のプレフィックスキャッシュは有効**。同一ペルソナで 2 通目のチャットは `cached_tokens > 0`（実測でキャッシュヒット率 ~43%）。→ Issue #20 の「静的部分を先頭に固定」戦略の前提が実データで裏付けられた
    - Gemini 3.1 Flash Lite / Grok 4.3 のキャッシュ対応可否は、それらで会話した際の `cached_tokens` を `/usage` で見れば自動的に判明する（別調査不要）
  - **申し送り（既知の挙動・T1 のバグではない）**:
    - クライアントがストリームを最後まで消費せず切断すると（SIGPIPE 等）、最終 usage チャンクが届かずその 1 件は記録されない。通常の ChatView は全量消費するので実害なし
    - extract route は `recordUsage` を `addMemory` より前に実行するため、記憶保存が FK 制約等で失敗しても usage は記録される
- 2026-07-02: Issue #20 を全面改訂（課題は維持、原因分析・対策を書き換え、旧 Phase 0〜2 設計コメント 3 件を削除）
- 2026-07-02: ブランチ整理（claude/aws-azure-cost-analysis-rm67tp をローカル・リモートとも削除、main を origin に同期）
