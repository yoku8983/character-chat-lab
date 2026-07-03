# 正解データセット（参照付き Judge 用）

`scripts/eval/judge.ts` の参照付きモードで使う「正解応答例（原作準拠の模範応答）」を
JSON で定義するディレクトリです。`npm run eval -- --dataset <path>` で指定します。

## 著作権・隔離に関する注意（重要）

**原作のキャラクターの台詞・エピソードを含む実キャラ用データセットは、絶対にこのリポジトリに
コミットしないでください。** このディレクトリは `.gitignore` で以下のように隔離されています。

```
scripts/eval/datasets/*
!scripts/eval/datasets/README.md
!scripts/eval/datasets/example-*.json
```

- `README.md` とこのファイル名パターン `example-*.json`（架空サンプルキャラ専用）のみ追跡対象
- 実際に評価で使う本番キャラのデータセット（`*.json`）はこのディレクトリに置いてローカルでのみ
  使用し、コミットしないこと。必要であればリポジトリ外（別ディレクトリ）に置いても構いません

`example-tetsu-oyaji.json` は本リポジトリのサンプルペルソナ `personas/tetsu-oyaji.yaml`
（架空キャラ）専用のサンプルであり、実在の著作物からの引用ではありません。

## フォーマット

```jsonc
{
  "personaId": "tetsu-oyaji",
  "referencePairs": [
    {
      "situation": "状況・ユーザー発話",
      "reference": "この人物の本物の（原作準拠の）応答例",
      "canon": true, // true=原作の名場面由来 / false=原作にない状況
      "notes": "任意の補足メモ"
    }
  ]
}
```

- `personaId` / `referencePairs` は必須。`referencePairs` は1件以上必須
- 各ペアの `situation` / `reference` は空でない文字列、`canon` は真偽値が必須。`notes` は任意
- 未知のフィールドは無視されます（将来 PR で知識クイズ `knowledgeQuiz` を同ファイルに追加予定）

## `canon: false` ペアを必ず含める理由（リファレンス過適合の防止）

参照付き Judge は「正解例の文言をそのまま使い回しているだけ」の応答を高評価にしてしまうリスクが
あります。これを防ぐため、データセットには **原作にそのまま存在する名場面（`canon: true`）だけでなく、
原作にない状況を想定した応答例（`canon: false`）を必ず含めてください**。`canon: false` のペアが
正しく評価できているかどうかは、「この人物らしさ」が原作の場面依存ではなく汎化して身についているかの
検証になります。目安として、全体の3〜4割程度は `canon: false` にすることを推奨します。
