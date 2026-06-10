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

このフローは`us-east-1`でE2E確認済みです。BedrockにはClaude Haiku 4.5の
inference profile ID
`us.anthropic.claude-haiku-4-5-20251001-v1:0`を使用します。

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

- `BEDROCK_MODEL_ID`: Converse APIで利用するモデルIDまたは
  inference profile ID
- `AWS_REGION`: Bedrockを呼び出すAWSリージョン
- `AWS_DEFAULT_REGION`: `AWS_REGION`がない場合の代替リージョン
- `BEDROCK_MAX_TOKENS`: 最大出力トークン数
- `BEDROCK_TEMPERATURE`: 生成温度。0.0以上1.0以下

`us-east-1`でClaude Haiku 4.5を利用する場合の推奨値は
`us.anthropic.claude-haiku-4-5-20251001-v1:0`です。通常モデルID
`anthropic.claude-haiku-4-5-20251001-v1:0`では呼び出しに失敗し、
`us.`で始まるinference profile IDで成功することを確認しています。
モデルやリージョンによっては、通常モデルIDではなくinference profile IDが
必要です。

Claude Haiku 4.5などAWS Marketplace経由の第三者モデルは、AWSアカウントで
初めて呼び出す際にBedrockが購読処理を開始することがあります。呼び出し主体に
`aws-marketplace:ViewSubscriptions`や`aws-marketplace:Subscribe`などの
権限がない場合、初回呼び出しだけ一時的に成功し、その後の呼び出しが
`AccessDeniedException`になることがあります。

この場合は、管理者権限でBedrock Playgroundから対象モデルを一度実行して
利用を有効化するか、利用有効化を行う作業用IAMユーザーまたはロールへ
`AWSMarketplaceManageSubscriptions`を付与します。購読完了後、通常の
モデル呼び出しだけを行うLambda実行ロールにはMarketplace権限は不要です。
詳細は[docs/deployment.md](docs/deployment.md)を参照してください。

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

## WSL2ローカル開発環境

ローカル開発はWSL2上のリポジトリと`.venv`を使用します。

```bash
cd /home/yoku8983/projects/character-chat-lab
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

以降のローカルコマンドは、同じシェルで`.venv`を有効化した状態で
実行します。新しいシェルでは次のコマンドで再度有効化します。

```bash
source .venv/bin/activate
```

## 依存関係

Lambdaへ同梱するPython依存関係は`src/requirements.txt`で管理します。
現在、追加で同梱するサードパーティーパッケージはありません。

アプリが利用する`boto3`は`requirements.txt`へ含めず、Python 3.12の
AWS Lambdaランタイムに同梱されるSDKを利用します。現時点では
`boto3`以外の外部依存がなく、デプロイパッケージとビルドを最小限に
保つためです。将来、SDKの特定バージョンが必要になった場合は
`src/requirements.txt`へバージョンを明記して同梱します。

`scripts/seed_default_character.py`はLambda外のローカル環境で実行するため、
実行前に`.venv`へ`boto3`をインストールします。

```bash
source .venv/bin/activate
python -m pip install boto3
```

## テスト

Python 3.12環境で実行します。実AWS環境、AWS認証情報、
実Slackワークスペースは不要です。

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -p "test_*.py"
```

## デプロイ

AWS SAM CLIを使用します。詳細は
[docs/deployment.md](docs/deployment.md)を参照してください。

```bash
sam validate --lint
sam build
sam deploy --guided
```

SlackのSigning SecretとBot Tokenはテンプレートへハードコードせず、
デプロイ時の`NoEcho`パラメータとして設定します。
