# 手動確認の節目ゲート

この文書は各Taskの手動確認手順ではなく、実装全体の方向性や外部契約を
人間が確認すべき節目だけを管理します。

## Gate 1: Receiver境界ゲート

Receiver LambdaがSlack署名を検証し、有効なユーザーメッセージだけを
SQSへ渡す責務に限定されていることを確認します。

確認観点:

- Slack Appのイベント購読範囲と権限が適切か
- SQSへ渡すメッセージ形式がWorkerの入力契約と一致するか
- botメッセージ、空メッセージ、Slack再送を適切に扱えるか

## Gate 2: 初回会話ゲート（確認済み）

Receiver、SQS、Worker、DynamoDB、Bedrock、Slack返信を接続した段階で、
最小の会話体験が成立していることを確認しました。

確認済み内容:

- Slack DMからReceiver Lambdaへイベントが到達した
- Receiver LambdaからSQSへイベントが送信された
- Worker LambdaがSQSイベントを処理した
- Worker LambdaがDynamoDBとBedrockを利用してSlackへ返信した
- MessagesTableへ`user`と`assistant`の両メッセージが保存された
- `us-east-1`でinference profile ID
  `us.anthropic.claude-haiku-4-5-20251001-v1:0`を使用して成功した

継続確認する観点:

- 次の発話で直近会話が反映されるか
- キャラクターカードの口調が効いているか

## Gate 3: 障害・重複処理ゲート

本番相当の再送や外部API失敗を想定し、会話が不必要に重複したり、
原因不明のまま欠落したりしないことを確認します。

確認観点:

- 同一SlackイベントでBedrock生成とSlack返信が重複しないか
- 条件付き書き込みが並行処理でも重複を防げるか
- BedrockまたはSlack API失敗時の処理済み記録と再試行方針
- SQS部分バッチ応答、可視性タイムアウト、DLQの設計が整合するか
- ログへ秘密情報、プロンプト全文、不要な会話本文を出していないか

## Gate 4: v0.1完了判定

新しい環境でもv0.1を再現でき、実際のSlack会話と障害調査まで
一通り成立することを確認します。

確認観点:

- READMEだけで再デプロイできるか
- Slack Events API URLを設定できるか
- Bedrockモデルアクセス設定が分かるか
- デフォルトキャラをDynamoDBに投入できるか
- Slack DMで実際に会話できるか
- CloudWatch Logsで障害調査できるか
