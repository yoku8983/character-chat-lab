# AWS SAMデプロイ手順

Character Chat Lab v0.1をAWSへデプロイし、Slack DMから会話できる状態に
するための手順です。

## 前提条件

次のツールと権限が必要です。

- Python 3.12
- WSL2
- AWS CLI v2
- AWS SAM CLI
- デプロイ先AWSアカウントとリージョン
- CloudFormation、Lambda、SQS、DynamoDB、IAM、Bedrockを作成・利用する権限
- Slack Appの管理権限

WSL2上でリポジトリへ移動し、ローカル開発用の`.venv`を作成して
有効化します。

```bash
cd /home/yoku8983/projects/character-chat-lab
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

新しいシェルを開いた場合は、作業前に再度有効化します。

```bash
source .venv/bin/activate
```

AWS CLIの認証を設定し、呼び出し元を確認します。E2E確認済みの
デプロイ先リージョンは`us-east-1`です。

```bash
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
`us-east-1`での推奨設定は次のとおりです。

- `BedrockModelId`:
  `us.anthropic.claude-haiku-4-5-20251001-v1:0`
- `BedrockModelResourceArn`: Workerへ`bedrock:InvokeModel`を許可するARN

Claude Haiku 4.5は、モデルやリージョンによって通常モデルIDではなく
inference profile IDが必要になる場合があります。`us-east-1`では通常モデルID
`anthropic.claude-haiku-4-5-20251001-v1:0`による呼び出しは失敗し、
`us.`で始まる上記inference profile IDでE2Eに成功しています。

最初の検証では`BedrockModelResourceArn=*`を利用できます。本番運用では
利用するfoundation modelまたはinference profileのARNへ絞ってください。

### 初回利用時のMarketplace購読

Claude Haiku 4.5などAWS Marketplace経由の第三者モデルは、AWSアカウントで
初めて呼び出す際にBedrockがMarketplace subscription処理をバックグラウンドで
開始することがあります。購読処理中はAPI呼び出しが一時的に成功する場合が
ありますが、必要な権限が不足して購読に失敗すると、それ以後の呼び出しが
`AccessDeniedException`になります。

利用有効化を行うIAMユーザーまたはロールには、少なくとも次のMarketplace
権限が必要です。

- `aws-marketplace:ViewSubscriptions`
- `aws-marketplace:Subscribe`
- `aws-marketplace:Unsubscribe`

対処方法は次のいずれかです。

1. Marketplace権限を持つ管理者でBedrockコンソールを開き、Playgroundから
   対象モデルを一度実行してAWSアカウントでの利用を有効化する
2. 利用有効化を行う作業用IAMユーザーまたはロールへAWS管理ポリシー
   `AWSMarketplaceManageSubscriptions`を付与して対象モデルを一度実行する

購読はAWSアカウントに対する一度限りの処理です。利用有効化が完了した後は、
通常のモデル呼び出しだけを行うLambda実行ロールにMarketplace購読権限を
追加する必要はありません。Lambda実行ロールには引き続き対象リソースへの
`bedrock:InvokeModel`を許可します。

Anthropicモデルでは、これとは別にAWSアカウントまたはAWS Organizations単位の
初回利用フォーム提出が必要です。

### inference profileのIAM Resource制限

`BedrockModelResourceArn=*`からResourceを絞る場合、呼び出し元リージョンの
inference profile ARNだけでは不十分です。地理ベースのinference profileは
複数リージョンへリクエストをルーティングするため、次のリソースを
`bedrock:InvokeModel`の許可対象として考慮します。

- 呼び出すinference profile ARN
- 呼び出し元リージョンのfoundation model ARN
- inference profileが利用する全ルーティング先リージョンの
  foundation model ARN

利用するinference profileのルーティング先リージョンはAWS公式ドキュメントで
確認してください。必要に応じて`bedrock:InferenceProfileArn`条件キーで
利用可能なinference profileを制限します。

モデルカタログで対象モデルとリージョンを確認し、必要ならPlaygroundで
一度呼び出して利用可能な状態にします。アクセスが未完了の場合、
WorkerのCloudWatch Logsには`AccessDeniedException`が記録されます。

参考:

- [Amazon Bedrockのモデルアクセス](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
- [Converse API対応モデル](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-supported-models-features.html)
- [地理ベースのクロスリージョン推論](https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html)
- [AWSMarketplaceManageSubscriptions](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSMarketplaceManageSubscriptions.html)

## テスト

リポジトリ直下で、デプロイ前に既存テストを実行します。

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -p "test_*.py"
```

## SAMビルド

リポジトリ直下で実行します。

```bash
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

秘密値をWSL2の現在のシェルだけへ設定します。

```bash
export SLACK_SIGNING_SECRET="SlackのSigning Secret"
export SLACK_BOT_TOKEN="xoxb-..."
```

次にガイド付きデプロイを開始します。

```bash
sam deploy --guided
```

主な入力例:

- Stack Name: `character-chat-lab-v01`
- AWS Region: `us-east-1`
- Parameter `SlackSigningSecret`: `$SLACK_SIGNING_SECRET`の値
- Parameter `SlackBotToken`: `$SLACK_BOT_TOKEN`の値
- Parameter `DefaultCharacterId`: `default`
- Parameter `MessageHistoryLimit`: `20`
- Parameter `BedrockModelId`:
  `us.anthropic.claude-haiku-4-5-20251001-v1:0`
- Parameter `BedrockModelResourceArn`: 対象モデルARN。初回検証は`*`
- Parameter `BedrockMaxTokens`: `512`
- Parameter `BedrockTemperature`: `0.4`
- Allow SAM CLI IAM role creation: `Y`
- Save arguments to configuration file: `N`

最後の項目を`N`にする理由は、ガイド入力したSlack秘密値を
`samconfig.toml`へ保存しないためです。設定例
`samconfig.toml.example`には秘密値を含めていません。

デプロイ完了後、CloudFormation Outputsを確認します。

```bash
aws cloudformation describe-stacks \
  --stack-name character-chat-lab-v01 \
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
seedスクリプトはローカルでAWS SDKを使用するため、実行前に有効化した
`.venv`へ`boto3`をインストールします。

```bash
source .venv/bin/activate
python -m pip install boto3
python scripts/seed_default_character.py \
  --table-name "出力されたCharactersTableName" \
  --region "us-east-1"
```

投入内容は`seed/default_character.json`です。
`DefaultCharacterId`パラメータを変更した場合は、JSONの
`character_id`も同じ値へ変更してください。

DynamoDB上の内容を確認する例:

```bash
aws dynamodb get-item \
  --table-name "出力されたCharactersTableName" \
  --key '{"character_id":{"S":"default"}}' \
  --region "us-east-1"
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

```bash
sam logs --stack-name character-chat-lab-v01 \
  --name ReceiverFunction \
  --tail
```

```bash
sam logs --stack-name character-chat-lab-v01 \
  --name WorkerFunction \
  --tail
```

確認項目は`docs/manual-checkpoints.md`のGate 2とGate 4にまとめています。

## 再デプロイ

コードやテンプレートを変更した場合は再ビルドしてデプロイします。

```bash
sam build
sam deploy --guided
```

秘密値を入力する場合は、今回も設定ファイルへの保存を`N`にします。
DynamoDBテーブルには`DeletionPolicy: Retain`を設定しているため、
スタック削除時にも会話データとキャラクター設定が残ります。
