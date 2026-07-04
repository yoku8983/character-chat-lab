# 正解データセット v1 + 横展開整備（LLMOps） 設計書

- 日付: 2026-07-04
- 対象: Issue #34 T1 残タスク「本番キャラの正解ペア 20〜50 件 + クイズ設問の作成」+ 横展開整備
- ステータス: ユーザー承認済み

## 目的

パイロットキャラ（本番実キャラ 1 体。作品は劇場アニメ 1 本、以下「パイロット作品」）の
正解データセット v1（参照付き Judge 用の正解ペア + 知識クイズ）を作成し、参照付き Judge を
実運用可能にする。同時に、このパイロットの実体験から方法論・ツールを抽出し、
次のキャラを「低工数・高品質」で作れる仕組み（プレイブック + lint）を整備する。

**著作権・秘匿の大原則**: 実キャラのペルソナ JSON・原作セリフ・データセットは
GitHub に一切コミットしない。コミットするのは「仕組み」（スクリプト・ドキュメント・
gitignore）だけ。本ドキュメントおよびコミットメッセージでもキャラ名・作品名は匿名化する。

## 決定事項（ユーザー確定）

1. **時間軸方針**: ペルソナはパイロット作品の時点に統一する。`identity.point_in_time` を
   設定し、他作品時点由来の会話例はパイロット作品の文脈に調整する。過去作由来の
   決め台詞は「本人の記憶・来歴」として維持してよい。作品別の複数ペルソナ分割は将来の拡張。
2. **保存運用**: `personas/private/` を新設して gitignore に追加し、実キャラ JSON を配置。
   新規スクリプト `persona:push` で env の DB 接続先（ローカル / 本番 Turso）へ upsert する。
3. **v1 規模**: 正解ペア 50 件（canon:true 約 32 / canon:false 約 18）+ 知識クイズ 10 問
   （正答型 7 / ハルシネーション検出型 3）。

## 成果物

| 成果物 | 置き場所 | Git 追跡 |
| --- | --- | --- |
| ペルソナ JSON（作品時点に統一） | `personas/private/<キャラid>.json` | ❌（gitignore） |
| 原作セリフ原本 | `scripts/eval/datasets/sources/` へ移動 | ❌（隔離済みパス） |
| 正解データセット v1 | `scripts/eval/datasets/<キャラid>.json` | ❌(隔離済み) |
| `persona:push` スクリプト | `scripts/persona-push.ts` | ✅ PR① |
| ペルソナ・データセット作成プレイブック | `docs/persona-playbook.md` | ✅ PR② |
| データセット lint | `scripts/eval/dataset-lint.ts`（`npm run dataset:lint`） | ✅ PR② |

## 1. ペルソナ JSON の時点統一

- `identity.point_in_time` を追加（パイロット作品の時点を明記）
- `relationships` を追加（作品に登場する主要関係者への呼び方・態度）
- 他作品時点の examples を作品文脈に修正または差し替え
- 過去作の catchphrases は記憶・来歴として維持

## 2. persona:push スクリプト（PR①）

- `npm run persona:push -- --file personas/private/<id>.json`
- `lib/db-personas.ts` の `getPersona` / `createPersona` / `updatePersona` を再利用した upsert。
  `updatePersona` は name/definition のみ更新のため UI 設定の profile_image は保持される
- 接続先は既存どおり env（`LIBSQL_URL` / `LIBSQL_AUTH_TOKEN`）。未設定ならローカル既定 DB
- 実行前に接続先 URL と対象 id を表示。リモート接続（url が `libsql://` 等）の場合は
  `--yes` フラグ必須（本番誤爆防止）
- `persona:pull` は今回見送り（YAGNI）

## 3. データセット v1 の構成

- **canon: true 約 32 件**: 原作セリフ原本から「問答として成立する」やり取りのみ人手選定。
  独り言・戦闘音声・問答が対応しない発話は採らない。`situation` に感情文脈を必ず書く
- **canon: false 約 18 件**: 原作にない状況への模範応答。感情軸カバレッジ:
  平常 / 演説 / 劣勢 / 挑発された時 / 特別な相手に関する話題 / 政治・思想問答
- **knowledgeQuiz 10 問**: 正答型 7 + 捏造検出型（`mustNotContain`）3
- 作成フロー: エージェントが全ドラフト作成 → **25 件 × 2 バッチでユーザー監修** →
  修正反映 → 縮小スモーク（`npm run eval -- --dataset` 1 シナリオ × 2 ターン +
  `npm run eval:quiz`。コスト $0.01 未満）で loadDataset 通過と refFidelity 出力を実確認

## 4. 横展開整備（LLMOps、PR②。パイロット完了後に実体験から書く）

### 4-a. プレイブック `docs/persona-playbook.md`

キャラデータを含まない方法論のみのドキュメント。内容:

- 時点決定ルール（複数作品キャラは最初に `point_in_time` を決め、データセットと時間軸を
  一致させる。時間軸が動かないキャラは 1 ペルソナでよい、の判定基準）
- 原作セリフの選定規則（問答成立のみ・situation 必須・canon:false 3〜4 割・感情軸表）
- クイズ設計パターン（正答型 / 捏造検出型の作り分け）
- 工数目安と分業基準（外部 SaaS AI に切り出す工程 / 人間監修必須の工程）

### 4-b. セリフ加工用プロンプトテンプレート（プレイブック同梱）

1. **シーン抽出テンプレート**: 全セリフ集→対象キャラ登場シーンの分離 + 独り言・
   非対応問答のラベル付与。外部 AI チャットに貼り付けて使う前提
2. **正解ペアドラフト生成テンプレート**: シーン別セリフ + ペルソナ JSON →
   referencePairs ドラフト生成。選定規則をプロンプト側に埋め込む

今回のパイロットで実際に機能した手順を初版として書き起こす（実証ベース）。

### 4-c. データセット lint `npm run dataset:lint -- <path>`

- `loadDataset` の形式検証 + 品質ルール検査（canon:false 比率 3〜4 割、ペア数 20〜50、
  situation/reference の重複・極端な短さ、捏造検出型クイズ最低 2 問）
- 違反は警告表示のみ（エラーで止めない。推奨値のため）

### 4-d. 知見ログと外部リサーチ

- パイロット中の詰まり・判断・工数実績をログし、完了時にプレイブックへ反映
- ユーザーが外部 AI チャット（Web/論文調査）で取得するリサーチ結果
  （ロールプレイ評価の先行研究・対話ペア抽出の自動化・データ量の飽和点・
  キャラのバージョン管理・ASR パイプライン）を後日受領し、プレイブックと
  lint の推奨値に反映する。**受領までプレイブック執筆は確定させない**

## PR 分割と順序

1. **PR①** `feat/persona-push`: persona:push + gitignore（`personas/private/`）+ ドキュメント + 本設計書
2. **（PR なし・ローカルのみ）**: ペルソナ調整 → データセット v1 ドラフト → ユーザー監修
   （25 件 × 2 バッチ）→ スモーク評価
3. **PR②** `feat/persona-playbook`: プレイブック + テンプレート + dataset:lint
   （パイロット知見 + 外部リサーチ反映後）

## スコープ外

- 作品別（複数時点）ペルソナ分割
- 全セリフ自動加工パイプラインの実装・新規作品の文字起こし効率化（プレイブックに方法論のみ記載）
- `judge.ts summarizePersona` の新フィールド対応(T3 PR3 の A/B 検証前に別途対応)
- `persona:pull`
