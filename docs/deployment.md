# AWS SAMデプロイ手順

Character Chat Lab v0.1をAWSへデプロイし、Slack DMから会話できる状態に
するための手順です。

## 前提条件

次のツールと権限が必要です。

- Python 3.12
- AWS CLI v2
- AWS SAM CLI
- デプロイ先AWSアカウントとリージョン
- CloudFormation、Lambda、SQS、DynamoDB、IAM、Bedrockを作成・利用する権限
- Slack Appの管理権限

AWS CLIの認証とリージョンを設定し、呼び出し元を確認します。

```powershell
aws configure
aws sts get-caller-identity
```

## Slack Appで準備する値

Slack Appの管理画面から次の値を確認します。

- `SLACK_SIGNING_SECRET`: Basic InformationのSigning Secret
- `SLACK_BOT_TOKEN`: OAuth & PermissionsのBot User OAuth Token

Bot Token Scopesには少なくとも`chat:write`を追加します。DMイベントを
受け取る場合はEvent Subscriptionsで`message.im`を購読し、設定変更後に
Slack Appをワークスペースへ再インストールします。

秘密値は`template.yaml`や`samconfig.toml`へ書き込まないでください。
SAMテンプレートでは`NoEcho`パラメータとして受け取り、Lambda環境変数の
`SLACK_SIGNING_SECRET`と`SLACK_BOT_TOKEN`へ設定します。

## Bedrockモデルを決める

デプロイ先リージョンでConverse APIに対応するモデルIDを選びます。

- `BedrockModelId`: Converse APIへ渡すモデルIDまたは推論プロファイルID
- `BedrockModelResourceArn`: Workerへ`bedrock:InvokeModel`を許可するARN

最初の検証では`BedrockModelResourceArn=*`を利用できます。本番運用では
利用するfoundation modelまたはinference profileのARNへ絞ってください。

現在のAmazon Bedrock商用リージョンでは、適切なAWS Marketplace権限が
あれば多くのfoundation modelが原則自動で利用可能になります。
サードパーティーモデルでは初回利用時に購読処理が行われることがあり、
AnthropicモデルではアカウントまたはAWS Organizations単位で初回利用
フォームの提出が必要です。

モデルカタログで対象モデルとリージョンを確認し、必要ならPlaygroundで
一度呼び出して利用可能な状態にします。アクセスが未完了の場合、
WorkerのCloudWatch Logsには`AccessDeniedException`が記録されます。

参考:

- [Amazon Bedrockのモデルアクセス](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
- [Converse API対応モデル](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-supported-models-features.html)

## テスト

リポジトリ直下で、デプロイ前に既存テストを実行します。

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -p "test_*.py"
```

## SAMビルド

リポジトリ直下で実行します。

```powershell
sam validate --lint
sam build
```

Lambdaコードと`src/requirements.txt`は`src/`からビルドされ、
ReceiverとWorkerの両方でPython 3.12ランタイムを使用します。
`src/requirements.txt`に追加パッケージはなく、アプリが利用する
`boto3`はLambdaランタイム同梱版を使用します。この方針と理由は
READMEの「依存関係」を参照してください。

Bedrock Clientが参照する`AWS_REGION`はLambda実行環境から自動で
提供されます。Lambdaの予約済み環境変数なので`template.yaml`では
明示設定していません。

## 初回デプロイ

秘密値をPowerShellの現在セッションだけへ設定します。

```powershell
$env:SLACK_SIGNING_SECRET = "SlackのSigning Secret"
$env:SLACK_BOT_TOKEN = "xoxb-..."
```

次にガイド付きデプロイを開始します。

```powershell
sam deploy --guided
```

主な入力例:

- Stack Name: `character-chat-lab-v01`
- AWS Region: Bedrockモデルを利用するリージョン
- Parameter `SlackSigningSecret`: `$env:SLACK_SIGNING_SECRET`の値
- Parameter `SlackBotToken`: `$env:SLACK_BOT_TOKEN`の値
- Parameter `DefaultCharacterId`: `default`
- Parameter `MessageHistoryLimit`: `20`
- Parameter `BedrockModelId`: 選択したモデルID
- Parameter `BedrockModelResourceArn`: 対象モデルARN。初回検証は`*`
- Parameter `BedrockMaxTokens`: `512`
- Parameter `BedrockTemperature`: `0.4`
- Allow SAM CLI IAM role creation: `Y`
- Save arguments to configuration file: `N`

最後の項目を`N`にする理由は、ガイド入力したSlack秘密値を
`samconfig.toml`へ保存しないためです。設定例
`samconfig.toml.example`には秘密値を含めていません。

デプロイ完了後、CloudFormation Outputsを確認します。

```powershell
aws cloudformation describe-stacks `
  --stack-name character-chat-lab-v01 `
  --query "Stacks[0].Outputs"
```

主な出力:

- `SlackEventsEndpointUrl`
- `SqsQueueUrl`
- `CharactersTableName`
- `MessagesTableName`
- `ProcessedEventsTableName`

## デフォルトキャラクターを投入する

Outputsの`CharactersTableName`を使い、サンプルJSONを投入します。
Python環境には`boto3`が必要です。

```powershell
python -m pip install boto3
python scripts/seed_default_character.py `
  --table-name "出力されたCharactersTableName" `
  --region "デプロイ先リージョン"
```

投入内容は`seed/default_character.json`です。
`DefaultCharacterId`パラメータを変更した場合は、JSONの
`character_id`も同じ値へ変更してください。

DynamoDB上の内容を確認する例:

```powershell
aws dynamodb get-item `
  --table-name "出力されたCharactersTableName" `
  --key '{"character_id":{"S":"default"}}' `
  --region "デプロイ先リージョン"
```

## Slack Events API URLを設定する

Slack App管理画面のEvent Subscriptionsを開きます。

1. Enable Eventsを有効化します。
2. Request URLへCloudFormation出力の`SlackEventsEndpointUrl`を設定します。
3. URL verificationが成功することを確認します。
4. Subscribe to bot eventsへ`message.im`を追加します。
5. OAuthスコープ変更後はアプリをワークスペースへ再インストールします。

Function URLは公開エンドポイントですが、Receiver LambdaがSlackの
署名とリクエスト時刻を検証します。

## 動作確認とログ

Slack AppとのDMでメッセージを送り、返信を確認します。

Lambdaログを追跡する例:

```powershell
sam logs --stack-name character-chat-lab-v01 `
  --name ReceiverFunction `
  --tail
```

```powershell
sam logs --stack-name character-chat-lab-v01 `
  --name WorkerFunction `
  --tail
```

確認項目は`docs/manual-checkpoints.md`のGate 2とGate 4にまとめています。

## 再デプロイ

コードやテンプレートを変更した場合は再ビルドしてデプロイします。

```powershell
sam build
sam deploy --guided
```

秘密値を入力する場合は、今回も設定ファイルへの保存を`N`にします。
DynamoDBテーブルには`DeletionPolicy: Retain`を設定しているため、
スタック削除時にも会話データとキャラクター設定が残ります。
