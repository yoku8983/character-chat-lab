# Character Chat Lab v0.1

SlackベースのキャラクターAIチャットMVPです。

現在は、Slack Events APIを受け取るReceiver Lambda、SQSを処理する
Worker Lambda、DynamoDBリポジトリ層、Prompt Builder、
Amazon Bedrock Converse API Client、Slack Web API Clientまでを
実装しています。AWS SAMによるデプロイ定義も含まれます。

## 処理フロー

```text
Slack Events API
  -> Receiver Lambda
  -> SQS
  -> Worker Lambda
  -> DynamoDB + Amazon Bedrock
  -> Slack chat.postMessage
```

Worker Lambdaは次の順で処理します。

1. ReceiverがSQSへ保存したSlackイベントを検証
2. `team_id:channel_id`形式の`session_id`を生成
3. 処理済みイベントを確認し、条件付き書き込みで重複を防止
4. ユーザーメッセージをDynamoDBへ保存
5. キャラクターカードと直近の会話履歴を取得
6. Prompt Builderでプロンプトを生成
7. Bedrock Converse APIで返信を生成
8. キャラクター返信をDynamoDBへ保存
9. Slackの`chat.postMessage`で返信

不正なSQSメッセージと重複イベントはログを残してスキップします。
処理中の失敗はSQS部分バッチ応答の`batchItemFailures`へ追加します。

## 主な構成

```text
src/app/
├── config.py
├── receiver_handler.py
├── worker_handler.py
├── db/
│   ├── characters.py
│   ├── messages.py
│   └── processed_events.py
├── llm/
│   ├── base.py
│   ├── bedrock_client.py
│   └── prompt_builder.py
└── slack/
    ├── client.py
    ├── parser.py
    └── signature.py
template.yaml
docs/deployment.md
seed/default_character.json
scripts/seed_default_character.py
```

Lambdaハンドラー:

- Receiver: `app.receiver_handler.lambda_handler`
- Worker: `app.worker_handler.lambda_handler`

## 環境変数

Receiver Lambda:

- `SLACK_SIGNING_SECRET`: Slack AppのSigning Secret
- `SQS_QUEUE_URL`: メッセージを送信するSQSキューURL

Worker LambdaとDynamoDB:

- `SLACK_BOT_TOKEN`: Slack Bot User OAuth Token
- `CHARACTERS_TABLE_NAME`: キャラクター設定テーブル名
- `MESSAGES_TABLE_NAME`: 会話メッセージテーブル名
- `PROCESSED_EVENTS_TABLE_NAME`: 処理済みイベントテーブル名
- `DEFAULT_CHARACTER_ID`: 既定キャラクターID
- `MESSAGE_HISTORY_LIMIT`: Promptへ渡す直近履歴の最大件数

Amazon Bedrock:

- `BEDROCK_MODEL_ID`: Converse APIで利用するモデルID
- `AWS_REGION`: Bedrockを呼び出すAWSリージョン
- `AWS_DEFAULT_REGION`: `AWS_REGION`がない場合の代替リージョン
- `BEDROCK_MAX_TOKENS`: 最大出力トークン数
- `BEDROCK_TEMPERATURE`: 生成温度。0.0以上1.0以下

## DynamoDBのキー

- Characters: パーティションキー`character_id`
- Messages: パーティションキー`session_id`、ソートキー`created_at`
- Processed Events: パーティションキー`event_id`

Messagesには`role`としてユーザー発話を`user`、キャラクター返信を
`assistant`で保存します。`created_at`はUTCのISO 8601形式です。

Processed Eventsには処理時刻`processed_at`と7日後のTTL
`expires_at`を保存します。テーブル側で`expires_at`をTTL属性として
設定する想定です。

## Prompt Builder

`app.llm.prompt_builder.build_prompts`はキャラクターカード、直近履歴、
最新ユーザー発話を受け取り、`(system_prompt, user_prompt)`を返します。

キャラクターカードでは`name`、`summary`、`speech_style`、
`personality`、`behavior_rules`、`example_dialogues`、
`conversation_notes`を使用します。

## 外部API Client

`BedrockConverseClient.generate_reply`は返信本文だけを返します。
API失敗時は`BedrockApiError`、空応答時は
`BedrockEmptyResponseError`を送出します。

`SlackClient.post_message`はBearer認証付きJSONリクエストで
`chat.postMessage`を呼び出します。失敗時は`SlackApiError`を
送出します。

通常ログにはプロンプト全文やSlack Bot Tokenを記録しません。

## 依存関係

Lambdaへ同梱するPython依存関係は`src/requirements.txt`で管理します。
現在、追加で同梱するサードパーティーパッケージはありません。

アプリが利用する`boto3`は`requirements.txt`へ含めず、Python 3.12の
AWS Lambdaランタイムに同梱されるSDKを利用します。現時点では
`boto3`以外の外部依存がなく、デプロイパッケージとビルドを最小限に
保つためです。将来、SDKの特定バージョンが必要になった場合は
`src/requirements.txt`へバージョンを明記して同梱します。

`scripts/seed_default_character.py`はLambda外のローカル環境で実行するため、
実行するPython環境には別途`boto3`のインストールが必要です。

## テスト

Python 3.12環境で実行します。実AWS環境、AWS認証情報、
実Slackワークスペースは不要です。

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -p "test_*.py"
```

## デプロイ

AWS SAM CLIを使用します。詳細は
[docs/deployment.md](docs/deployment.md)を参照してください。

```powershell
sam validate --lint
sam build
sam deploy --guided
```

SlackのSigning SecretとBot Tokenはテンプレートへハードコードせず、
デプロイ時の`NoEcho`パラメータとして設定します。
