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
4. ~~T4: 評価基盤（multi-turn 必須・Judge は別系統モデル）~~ ✅ 完了（`feat/t4-eval-harness`。詳細は末尾「完了済み」）
5. ~~T5: モデル × temperature 実験~~ ✅ **完了（実装＋実験ラン＋決定まで）**。結論: **DeepSeek V4 Flash 継続が最適**（詳細は末尾）
6. ~~T7: プロンプト構造のキャッシュ最適化~~ ✅ 完了 / **T6: 一部完了**（infra は実装、会話例拡充等は T5 結果より見送り）（`feat/t6-t7-persona-cache`。詳細は末尾）
7. 動的コンテキスト選択は**封印**（解除条件は Issue #20 参照。実装しないこと）

→ Issue #20 の対策タスク T1〜T7 は一巡完了（T6 の会話例拡充・知識エピソード化のみ意図的に保留。封印事項は着手しない）。次は残タスクの棚卸し or 保留項目の要否を判断する段階。

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

- 2026-07-03: **T7（キャッシュ最適化）+ T6 一部 完了**（ブランチ `feat/t6-t7-persona-cache`）
  - **T7**: `lib/prompt.ts buildSystemPrompt` を並び替え。エピソード記憶（変動）を行動制約（静的）の後ろへ移動し、順序を「静的（キャラ定義〜知識〜記憶〜行動制約〜anti_examples）→ エピソード記憶（変動）→ 重要な指示（最末尾）」に。静的ブロックを連続プレフィクス化してプレフィクスキャッシュを効かせやすくした。文言・内容は不変
    - 注: OpenRouter のキャッシュ効果（cached_tokens）は**プロバイダ・ルーティング依存で非決定的**（同一プレフィクスでも別プロバイダに振られると効かない。T1 で 43% ヒットの回もあれば 0% の回もある）。並び替えは構造的最適化であり、単発の cached 値では測れない。実効果は /usage の多リクエスト集計で経時観測する
  - **T6-3 anti_examples（optional スキーマ）**: `lib/types.ts` の `Persona` に `anti_examples?: {user,assistant}[]` を追加。定義があるペルソナだけ「## こう応答してはいけない（悪い例）」を静的領域に否定文脈で描画。**サンプルには入れず dormant**（逆誘発リスクがあるため、常用は T4 ハーネスで効果検証してから）
  - **T6-5 YAML 再反映（content_hash・source 昇格なし）**: `seeded_personas` に `content_hash` 追加。`syncYamlPersonas` を「ハッシュ一致ならスキップ、相違（YAML 更新）なら **`source='yaml'` の行だけ** YAML から再反映」に変更。`source='db'`（UI 作成）は保護、削除済みは復活しない（UPDATE で 0 行）。**UI 編集時の source 昇格はしない**（ユーザー選択: UI 編集した yaml ペルソナは次回 YAML 更新で上書きされ得る割り切り）
  - **見送り（T5 結果に基づく判断）**: T6-2 会話例拡充 / T6-4 知識のエピソード形式化は実装せず。理由: T5 で品質は judge 天井（5.0）・ドリフト無しと実証済みで、データ拡充を正当化する品質欠損がない（「計測ファースト/YAGNI」）。かつ本番実キャラはリポジトリ外でサンプル拡充の価値が低い。必要になれば anti_examples スキーマ＋ハーネスで検証しながら拡充可能。T6-1 パイロット選定は運用（本番 JSON を `--persona-file`）で実質確立済み
  - 検証: tsx + 一時 DB で13アサーション全通過（プロンプト順序 / anti_examples 描画・非描画 / content_hash 再反映・source='db' 保護・削除復活なし）。dev で2往復チャット 200・キャラ応答（回帰なし）。`tsc` パス
- 2026-07-03: **T5 実験ラン実施 → 最適点を決定**（`npm run eval:sweep` を本番実キャラ1体で実行）
  - スコープ: 4モデル（deepseek-flash / deepseek-pro / gemini-flash-lite / grok-4.3）× temperature{0.3, 1.0} × 先頭4シナリオ × 各8ターン = 8構成・288 API コール・**総コスト $0.31**
  - 結果（judge=Gemini。数値はマーカー late 出現率と judge 平均、コストは4シナリオ分）:
    | 構成 | late一人称/語尾 | judge(tone/know/persona/nat) | cost |
    |---|---|---|---|
    | deepseek-flash@0.3 | 75%/63% | 5.0/5.0/5.0/5.0 | **$0.007** |
    | deepseek-flash@1.0 | 63%/75% | 5.0/5.0/5.0/5.0 | **$0.006** |
    | deepseek-pro@0.3 | 75%/75% | 5.0/5.0/5.0/5.0 | $0.050 |
    | deepseek-pro@1.0 | 63%/88% | 5.0/5.0/5.0/5.0 | $0.026 |
    | gemini-flash-lite@0.3 | 100%/100% | 5.0/5.0/5.0/5.0 | $0.043 |
    | gemini-flash-lite@1.0 | 100%/100% | 5.0/5.0/5.0/5.0 | $0.044 |
    | grok-4.3@0.3 | 50%/63% | 4.75/4.5/4.75/4.25 | $0.065 |
    | grok-4.3@1.0 | 63%/88% | 5.0/4.5/5.0/4.75 | $0.074 |
  - **決定: デフォルトは DeepSeek V4 Flash を継続**。judge 天井品質(全観点5.0)を**最安（他の 4〜10 倍安い）**で達成。Pro は judge 改善ゼロで 4〜7 倍コスト＝不要。Grok は品質劣（knowledge 4.5・自然さ低）かつ最高コスト＝不採用。Gemini-flash-lite は口調マーカー最良（100%/100%）だが judge 差なしで 6 倍コスト → 「口調一貫性が critical」になった時の premium 選択肢として保留
  - **temperature 変更は不要**: 上位モデルで 0.3 vs 1.0 に有意差なし（judge 同点、マーカーは±13pt のノイズ）。**`CHAT_TEMPERATURE` は未設定のまま＝現状維持**（本番の設定変更なし）
  - **⚠️ 方法論的留意（重要・次の改善余地）**: judge が上位3モデルに軒並み 5.0 ＝ **判定の飽和/天井効果**。現行のシナリオ規模・rubric では強モデル同士を細かく順位づけできない。将来もっと厳しく比較したいなら「より難度の高いシナリオ」or「減点式の厳格な rubric」or「別の高性能 judge」への改善が必要（T4 ハーネス改良の候補）。T4 baseline（ドリフト無し）とも整合し、**現状の構成で品質は十分**という結論の裏付けにもなっている
  - 本番ペルソナ JSON・スイープレポートはリポジトリ外で扱い実行後に削除済み（Push なし・痕跡なし）
- 2026-07-03: **T5 モデル × temperature 実験（実装）完了**（ブランチ `feat/t5-model-temp`）
  - **本番 chat route に temperature 対応追加**: 環境変数 `CHAT_TEMPERATURE`（0〜2 にクランプ）を OpenRouter リクエストに条件付き付与。未設定・空・非数値なら送らない＝**後方互換**。最適点が決まったら本番でこの env を設定する運用ノブ。プロンプト・messages の並びは不変
  - **評価ハーネスのコアを `scripts/eval/harness.ts` に切り出し**（`runEval(cfg)`）、`run.ts`（単一構成）と新規 `sweep.ts`（モデル×temperature スイープ）の両方から再利用
  - **スイープ実行 `npm run eval:sweep`**: `--models`(csv)×`--temps`(csv, `default`=未指定可) の全組み合わせを回し、`console.table` で比較表（late一人称%/late語尾%/Δ/judge 4観点/cost/skip）＋総コストを出力、`eval/reports/sweep-*.json` に保存。実行前に推定 API 呼び出し回数を表示
  - 検証: スモーク（tetsu-oyaji × flash × {0.3, default} × 1シナリオ×3ターン）でスイープ比較表・レポート出力を確認（総コスト $0.0012）。run.ts 単体もリファクタ後に正常。**本番 chat route も `CHAT_TEMPERATURE=0.4` 設定で HTTP 200・キャラ応答を確認**。`tsc` パス
  - **実験ラン（items 2-3）は未実施**: 本番実キャラ JSON × 4モデル × temperature 数点 × 10シナリオは API コスト大のためユーザーが実行。手順: `npm run eval:sweep -- --persona-file <本番JSON> --scenarios <n> --max-turns <n>` → 比較表を見て「品質/コストの最適点」を決定 → 本番に `CHAT_TEMPERATURE` を設定。T4 の baseline（Flash/16ターン/30上限で口調ドリフトほぼ無し）が比較の起点
- 2026-07-03: **T4 評価基盤（multi-turn 会話ハーネス）完了**（ブランチ `feat/t4-eval-harness`）
  - スタンドアロン CLI `scripts/eval/`（`tsx` を devDep 追加。`npm run eval` / `npm run eval:compare`）。アプリ本体（app/・lib/）は無変更で、`lib/personas`・`lib/prompt`・`lib/history` を相対 import で再利用
  - 構成: `scenarios.ts`（10 本×各16ターン・ペルソナ非依存・軸網羅）/ `markers.ts`（persona の speaking_style から一人称・語尾・口癖マーカーを導出、early/late 1/3 で出現率とドリフト delta を算出）/ `judge.ts`（LLM-as-Judge。口調一貫性・知識活用度・人格維持・自然さを 1〜5 で採点）/ `openrouter.ts`（非ストリーミング＋429/5xx リトライ）/ `report.ts`（`eval/reports/` に JSON 出力・gitignore 済み）/ `compare.ts`（Before/After 差分）
  - **設計判断（ユーザー確定）**: パイロットキャラはサンプル（mira/tetsu-oyaji）ではなく**本番デプロイ版の実キャラ JSON を `--persona-file` で与えて評価**する（サンプルは実在キャラとの正確性を測れないため）。**本番 JSON をローカルで評価する際は Main→Azure デプロイ版とローカル開発版のプロンプト構築ロジック等の環境差分に注意**（README にも明記）
  - Judge は `google/gemini-3.1-flash-lite`（被評価 DeepSeek と別系統。推奨モデル一覧内。env `EVAL_JUDGE_MODEL` で変更可）
  - **実データで判明したハーネス不具合を修正**（同 PR に含む）: 本番ペルソナは `first_person: "私（わたし）"`・`sentence_endings: "〜のだよ"` のような装飾表記（ふりがな括弧・波ダッシュ）を持ち、完全一致 includes では実応答（「私」「のだよ」）に当たらず出現率が誤って 0% になった。`markers.ts` に `normalizeMarker`（波ダッシュ除去＋括弧前/括弧内の両候補化）を追加して解消
  - **本評価（baseline）実測済み**: 本番実キャラ1体 × DeepSeek V4 Flash × 全10シナリオ×16ターン、maxHistory=30。総コスト **$0.040**。結果:
    - **口調ドリフトはほぼ検出されず**。一人称 early→late 72%→78%（delta +6%）、語尾 68%→70%（delta +2%）＝後半でも口調は維持（T2 の履歴上限 30 が効いている可能性）
    - LLM-as-Judge（Gemini）平均: 口調一貫性 5.00 / 知識活用度 4.90 / 人格維持 5.00 / 自然さ 5.00（ほぼ満点、劣化なし）
    - 「短い応答を促す」シナリオのみマーカー出現率が低い（一言回答では一人称・語尾が出ないため。ドリフトではなく仕様）
    - 含意: **この構成（Flash + 30上限 + 16ターン）では口調崩れは顕在化しない**。T5 で他モデル/temperature を振り compare で差を見る際の基準になる（ただし baseline レポートは本番キャラ参照のため削除済み・要再取得）
  - **本番ペルソナ JSON の取り扱い**: リポジトリ外（スクラッチパッド）で評価し、テスト後に JSON・レポートとも削除。`eval/reports/` は gitignore 済みで Push されない。リポジトリ内に本番キャラの痕跡は残していない
  - 次アクション（T5）: 本番 JSON を再度用意 → `npm run eval -- --persona-file <path> --model <各モデル> --temperature <値>` で複数取得 → `npm run eval:compare <before> <after>` で品質/コスト比較
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
