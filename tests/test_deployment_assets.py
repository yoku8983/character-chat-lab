import json
import tomllib
import unittest
from pathlib import Path

from scripts.seed_default_character import _load_character

ROOT = Path(__file__).resolve().parents[1]


class DeploymentAssetsTest(unittest.TestCase):
    def test_template_contains_required_resources_and_settings(self):
        template = (ROOT / "template.yaml").read_text(encoding="utf-8")

        required_fragments = [
            "ReceiverFunction:",
            "WorkerFunction:",
            "SlackEventsQueue:",
            "CharactersTable:",
            "MessagesTable:",
            "ProcessedEventsTable:",
            "Runtime: python3.12",
            "FunctionUrlConfig:",
            "ReportBatchItemFailures",
            "sqs:SendMessage",
            "sqs:ReceiveMessage",
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "bedrock:InvokeModel",
            "SLACK_SIGNING_SECRET: !Ref SlackSigningSecret",
            "SLACK_BOT_TOKEN: !Ref SlackBotToken",
            "SQS_QUEUE_URL: !Ref SlackEventsQueue",
            "CHARACTERS_TABLE_NAME: !Ref CharactersTable",
            "MESSAGES_TABLE_NAME: !Ref MessagesTable",
            "PROCESSED_EVENTS_TABLE_NAME: !Ref ProcessedEventsTable",
            "DEFAULT_CHARACTER_ID: !Ref DefaultCharacterId",
            "MESSAGE_HISTORY_LIMIT: !Ref MessageHistoryLimit",
            "BEDROCK_MODEL_ID: !Ref BedrockModelId",
            "BEDROCK_MAX_TOKENS: !Ref BedrockMaxTokens",
            "BEDROCK_TEMPERATURE: !Ref BedrockTemperature",
            "SlackEventsEndpointUrl:",
            "SqsQueueUrl:",
            "CharactersTableName:",
            "MessagesTableName:",
            "ProcessedEventsTableName:",
        ]
        for fragment in required_fragments:
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, template)

        self.assertNotIn("xoxb-", template)
        self.assertIn("NoEcho: true", template)

    def test_lambda_requirements_use_runtime_boto3(self):
        path = ROOT / "src" / "requirements.txt"
        content = path.read_text(encoding="utf-8")
        dependencies = [
            line.strip()
            for line in content.splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]

        self.assertEqual(dependencies, [])
        self.assertIn("Lambdaランタイム同梱版", content)

    def test_samconfig_example_is_valid_toml_without_secrets(self):
        path = ROOT / "samconfig.toml.example"
        content = path.read_text(encoding="utf-8")

        parsed = tomllib.loads(content)

        self.assertEqual(parsed["version"], 0.1)
        deploy = parsed["default"]["deploy"]["parameters"]
        self.assertEqual(deploy["region"], "us-east-1")
        self.assertIn(
            "BedrockModelId="
            "us.anthropic.claude-haiku-4-5-20251001-v1:0",
            deploy["parameter_overrides"],
        )
        self.assertNotIn("SlackSigningSecret", content)
        self.assertNotIn("SlackBotToken", content)
        self.assertNotIn("xoxb-", content)

    def test_default_character_seed_matches_prompt_contract(self):
        path = ROOT / "seed" / "default_character.json"

        item = _load_character(path)

        self.assertEqual(item["character_id"], "default")
        self.assertTrue(item["name"])
        self.assertTrue(item["summary"])

        with path.open(encoding="utf-8") as source:
            self.assertIsInstance(json.load(source), dict)

    def test_gate_4_contains_required_checks(self):
        checkpoints = (
            ROOT / "docs" / "manual-checkpoints.md"
        ).read_text(encoding="utf-8")

        required_checks = [
            "Gate 4: v0.1完了判定",
            "READMEだけで再デプロイできるか",
            "Slack Events API URLを設定できるか",
            "Bedrockモデルアクセス設定が分かるか",
            "デフォルトキャラをDynamoDBに投入できるか",
            "Slack DMで実際に会話できるか",
            "CloudWatch Logsで障害調査できるか",
        ]
        for check in required_checks:
            with self.subTest(check=check):
                self.assertIn(check, checkpoints)

    def test_gate_2_records_successful_e2e(self):
        checkpoints = (
            ROOT / "docs" / "manual-checkpoints.md"
        ).read_text(encoding="utf-8")

        required_checks = [
            "Gate 2: 初回会話ゲート（確認済み）",
            "MessagesTableへ`user`と`assistant`の両メッセージが保存された",
            "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        ]
        for check in required_checks:
            with self.subTest(check=check):
                self.assertIn(check, checkpoints)

    def test_deployment_docs_include_bedrock_marketplace_notes(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        deployment = (
            ROOT / "docs" / "deployment.md"
        ).read_text(encoding="utf-8")

        required_readme_fragments = [
            "us.anthropic.claude-haiku-4-5-20251001-v1:0",
            "aws-marketplace:ViewSubscriptions",
            "AWSMarketplaceManageSubscriptions",
            "Lambda実行ロールにはMarketplace権限は不要",
        ]
        for fragment in required_readme_fragments:
            with self.subTest(document="README.md", fragment=fragment):
                self.assertIn(fragment, readme)

        required_deployment_fragments = [
            "初回利用時のMarketplace購読",
            "aws-marketplace:Subscribe",
            "AWSMarketplaceManageSubscriptions",
            "inference profile ARN",
            "ルーティング先リージョン",
            "foundation model ARN",
        ]
        for fragment in required_deployment_fragments:
            with self.subTest(
                document="docs/deployment.md",
                fragment=fragment,
            ):
                self.assertIn(fragment, deployment)


if __name__ == "__main__":
    unittest.main()
