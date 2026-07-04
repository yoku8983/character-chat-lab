# 設計書: ペルソナスキーマ拡張（Issue #34 T3・PR 1）

- 日付: 2026-07-04
- 対象 Issue: #34 T3「ペルソナスキーマの実証改善」のうちスキーマ拡張部分
- ステータス: ユーザー承認済み

## 背景と T3 全体のロードマップ

T3 は「スキーマ拡張」と「A/B 実証」の 2 種類のタスクからなる。A/B 実証は参照付き Judge 用の正解データセット（本番キャラ・20〜50 ペア）が前提のため、以下の順で進める（ユーザー確定）:

```
PR 1: スキーマ拡張（user_role / relationships / point_in_time）← 本設計書
作業: 本番キャラのデータセット v1 をセッション対話で作成（〜35件 + Judge sanity check）
PR 2: データセット作成 GUI ツール（v1 の経験を反映して別途設計）
PR 3〜: A/B 実証(catchphrases 絞り込み / anti_examples 実投入 / 会話例増減)
```

新フィールドはデータセット作成時の factsheet（LLM 下書きに渡す根拠情報）を兼ねる。外部 AI による文献調査（RoleLLM / CharacterEval / RAIDEN / PersonaGym 等）の結論「LLM は候補作成者、人間が最終判断」「相手依存の振る舞いを明示的に扱う」を設計に反映している。

## 目的

1. `user_role`: ユーザーがキャラにとって誰か（例: プロデューサー）の既定値。現状は examples に暗黙に埋まっているだけで、想定外の相手への振る舞いが不定
2. `relationships`: 主要人物への呼び方・態度。原作会話の再現性と、相手依存の振る舞いの明示化
3. `point_in_time`: 物語上のどの時点のキャラか。時系列混在によるハルシネーション防止（実例: background に活動期と後年が混在するケースあり）
4. ついでに dormant の `anti_examples` に編集 UI を付ける（PR 3 の A/B 実証で編集手段が必要）

## 1. 型定義（`lib/types.ts`）

3 フィールドとも **optional**。既存ペルソナ・DB 内定義は無変更で動き続ける（実行時バリデーション層が無い現状とも整合）。

```ts
export interface Relationship {
  name: string;       // 相手の名前（例: アムロ）
  address_as: string; // 呼び方（例: 「アムロ」と呼び捨て）
  attitude: string;   // 態度・距離感（例: 好敵手として認めつつ挑発的）
}

export interface Persona {
  // ...既存フィールドは変更なし...
  identity: {
    personality: string;
    background: string;
    point_in_time?: string;   // 物語上のどの時点のキャラか
    speaking_style: SpeakingStyle;
  };
  user_role?: string;             // ユーザーはキャラにとって誰か
  relationships?: Relationship[]; // 主要人物への呼び方・態度
}
```

配置の理由: `point_in_time` は経歴（background）を修飾する情報なので `identity` 配下。`user_role` と `relationships` は対人関係の情報なのでトップレベル。

## 2. プロンプト組立（`lib/prompt.ts` の `buildSystemPrompt`）

3 セクションを追加する。**いずれも値が存在し空でないときのみ出力**（undefined・空文字・空配列ならセクションごと省略）。

| 挿入位置 | 見出し | 内容 |
|---|---|---|
| `## 経歴` の直後 | `## 時点` | 「あなたは物語上の【point_in_time】の時点にいます。それ以降の出来事はまだ起きておらず、あなたは知りません。」 |
| `## 行動制約` の前 | `## 人間関係` | 各 relationship を `- {name}: 「{address_as}」と呼ぶ。{attitude}` 形式で列挙 |
| `## 人間関係` の直後 | `## 会話相手` | 「いまあなたが会話している相手（ユーザー）は【user_role】です。」 |

- `## 時点` の「それ以降の出来事は知りません」がハルシネーション防止の核。単なる情報提示ではなく否定形の指示まで含める
- 口調変換用 `buildConvertSystemPrompt` は**変更しない**（personality と speaking_style のみ使う既存設計のまま）
- `buildFewShotMessages` も変更なし

## 3. 編集 UI（`components/PersonaEditor.tsx`）

- `point_in_time`: 経歴の直後にテキスト入力（1 行）
- `user_role`: テキスト入力（1 行）
- `relationships`: `knowledge.domains` と同じ「行追加/削除」パターンを流用。1 行 = name / address_as / attitude の 3 入力
- `anti_examples`: `examples` と同一の UI パターンでフォームセクションを追加（現状 JSON モードでしか編集できない dormant 状態を解消）
- `emptyPersona` 初期値に新フィールドを反映（optional なので undefined 初期値で可。フォーム上は空表示）
- JSON モードのキー凡例テーブルに `user_role` / `relationships` / `point_in_time` / `anti_examples` を追記
- 保存前後の件数突合検証（既存: domains / entries / constraints / examples）に `relationships` / `anti_examples` を追加

## 4. サンプルペルソナ（`personas/mira.yaml` / `personas/tetsu-oyaji.yaml`）

3 フィールドの実例値を追加する（スキーマの使い方のドキュメントを兼ねる）。値は各キャラの既存設定と矛盾しない範囲で新規作成する（サンプルキャラは AI 製架空キャラのため自由に作れる）。`relationships` は 1〜2 件、`user_role` と `point_in_time` は各 1 行で十分。content_hash 同期により次回起動時に DB へ反映される。

`anti_examples` のサンプル値は**追加しない**（効果は PR 3 の A/B 実証で測ってから。未検証のまま入れると実証の前提が汚れる）。

## 5. 評価系への影響

なし。eval ハーネスは `buildSystemPrompt` を再利用しているため、新フィールド入りペルソナを `--persona-file` で渡せば自動でプロンプトに乗る。`markers.ts` / `judge.ts` / `scripts/eval/persona-loader.ts` の `assertPersonaShape` は変更不要（optional フィールドのため）。

## 6. ドキュメント

- `README.md`: ペルソナスキーマ説明に 3 フィールド + anti_examples の編集 UI を追記
- `PROGRESS.md`: 完了メモ
- Issue #34 の T3 チェックボックス（該当 3 項目）をマージ後に更新

## エラーハンドリング

- 新フィールドはすべて optional。欠落・空値はプロンプトからセクションごと省略（エラーにしない）
- `relationships` の要素に空文字が混じった場合もそのまま出力する（バリデーション層が無い現状の一貫性を保つ。厳格化は将来 zod 導入時にまとめて行う）

## テスト・検証方針（既存流儀を踏襲）

- tsx ワンオフ（コミットしない）: 新フィールドあり/なしペルソナで `buildSystemPrompt` を呼び、(a) 3 セクションが正しい位置・文言で入る、(b) 未指定なら一切出力されない、を確認
- dev サーバーで実挙動確認: PersonaEditor で新フィールドを編集・保存 → 再読込で保持 → チャット 1 往復で応答が新フィールドを反映（user_role を変えて呼び方が変わる等の目視）
- `npx tsc --noEmit`、`npx next build`（dev 停止後、build 後 `rm -rf .next`）

## 変更ファイル一覧（見込み）

| ファイル | 変更 |
|---|---|
| `lib/types.ts` | Relationship 追加、Persona 拡張 |
| `lib/prompt.ts` | buildSystemPrompt に 3 セクション追加 |
| `components/PersonaEditor.tsx` | 新フィールド + anti_examples のフォーム、凡例表、件数突合 |
| `personas/mira.yaml` / `personas/tetsu-oyaji.yaml` | 実例値追加 |
| `README.md` / `PROGRESS.md` | 追記 |
