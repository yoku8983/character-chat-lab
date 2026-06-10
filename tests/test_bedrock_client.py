import os
import sys
import unittest
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError

from app.config import BedrockSettings
from app.llm.bedrock_client import (
    BedrockApiError,
    BedrockConverseClient,
    BedrockEmptyResponseError,
    _create_runtime_client,
)


def _settings():
    return BedrockSettings(
        model_id="test.model-v1:0",
        region_name="ap-northeast-1",
        max_tokens=512,
        temperature=0.4,
    )


def _response(text="  キャラクターの返信です。  "):
    return {
        "output": {
            "message": {
                "role": "assistant",
                "content": [{"text": text}],
            }
        },
        "stopReason": "end_turn",
        "usage": {
            "inputTokens": 100,
            "outputTokens": 20,
            "totalTokens": 120,
        },
        "metrics": {"latencyMs": 250},
    }


class FakeAwsError(Exception):
    def __init__(self, code):
        super().__init__("AWS API error")
        self.response = {"Error": {"Code": code}}


class BedrockConverseClientTest(unittest.TestCase):
    def test_generate_reply_calls_converse_with_expected_shape(self):
        runtime_client = Mock()
        runtime_client.converse.return_value = _response()
        client = BedrockConverseClient(
            _settings(),
            runtime_client=runtime_client,
        )

        result = client.generate_reply(
            "システムプロンプト",
            "ユーザープロンプト",
        )

        self.assertEqual(result, "キャラクターの返信です。")
        runtime_client.converse.assert_called_once_with(
            modelId="test.model-v1:0",
            system=[{"text": "システムプロンプト"}],
            messages=[
                {
                    "role": "user",
                    "content": [{"text": "ユーザープロンプト"}],
                }
            ],
            inferenceConfig={
                "maxTokens": 512,
                "temperature": 0.4,
            },
        )

    def test_generate_reply_joins_text_blocks(self):
        runtime_client = Mock()
        runtime_client.converse.return_value = {
            "output": {
                "message": {
                    "content": [
                        {"text": " 一行目 "},
                        {"text": "二行目"},
                    ]
                }
            }
        }
        client = BedrockConverseClient(
            _settings(),
            runtime_client=runtime_client,
        )

        self.assertEqual(
            client.generate_reply("system", "user"),
            "一行目\n二行目",
        )

    def test_empty_response_raises_clear_error(self):
        runtime_client = Mock()
        runtime_client.converse.return_value = {
            "output": {
                "message": {
                    "content": [{"text": "   "}],
                }
            }
        }
        client = BedrockConverseClient(
            _settings(),
            runtime_client=runtime_client,
        )

        with self.assertRaisesRegex(
            BedrockEmptyResponseError,
            "返信本文が返されませんでした",
        ):
            client.generate_reply("system", "user")

    def test_api_error_is_wrapped_with_custom_exception(self):
        runtime_client = Mock()
        runtime_client.converse.side_effect = FakeAwsError("ThrottlingException")
        client = BedrockConverseClient(
            _settings(),
            runtime_client=runtime_client,
        )

        with self.assertLogs("app.llm.bedrock_client", level="ERROR"):
            with self.assertRaises(BedrockApiError) as context:
                client.generate_reply("system", "user")

        self.assertEqual(context.exception.error_code, "ThrottlingException")
        self.assertIn("Bedrock Converse API", str(context.exception))
        self.assertIsInstance(context.exception.__cause__, FakeAwsError)

    def test_client_error_logs_aws_code_and_message_without_prompts(self):
        runtime_client = Mock()
        runtime_client.converse.side_effect = ClientError(
            {
                "Error": {
                    "Code": "ValidationException",
                    "Message": "inference profile IDが必要です",
                }
            },
            "Converse",
        )
        client = BedrockConverseClient(
            _settings(),
            runtime_client=runtime_client,
        )
        system_prompt = "ログへ出してはいけないsystem_prompt"
        user_prompt = "ログへ出してはいけないuser_prompt"

        with patch("app.llm.bedrock_client.logger.error") as log_error:
            with self.assertRaises(BedrockApiError) as context:
                client.generate_reply(system_prompt, user_prompt)

        details = log_error.call_args.kwargs["extra"]
        self.assertEqual(details["bedrock_exception_type"], "ClientError")
        self.assertEqual(details["aws_error_code"], "ValidationException")
        self.assertEqual(
            details["aws_error_message"],
            "inference profile IDが必要です",
        )
        self.assertNotIn(system_prompt, repr(details))
        self.assertNotIn(user_prompt, repr(details))
        self.assertEqual(context.exception.error_code, "ValidationException")
        self.assertEqual(
            context.exception.error_message,
            "inference profile IDが必要です",
        )
        self.assertIn("ValidationException", str(context.exception))
        self.assertIn(
            "inference profile IDが必要です",
            str(context.exception),
        )
        detail_log = log_error.call_args
        self.assertIn("Bedrock Converse API", detail_log.args[0])
        self.assertIn("ValidationException", detail_log.args)
        self.assertIn("inference profile IDが必要です", detail_log.args)

    def test_api_error_log_does_not_include_exception_detail(self):
        runtime_client = Mock()
        secret_detail = "秘密のプロンプト断片"
        runtime_client.converse.side_effect = RuntimeError(secret_detail)
        client = BedrockConverseClient(
            _settings(),
            runtime_client=runtime_client,
        )

        with self.assertLogs("app.llm.bedrock_client", level="ERROR") as logs:
            with self.assertRaises(BedrockApiError):
                client.generate_reply("system", "user")

        self.assertNotIn(secret_detail, "\n".join(logs.output))

    def test_normal_logs_do_not_include_full_prompts(self):
        runtime_client = Mock()
        runtime_client.converse.return_value = _response()
        client = BedrockConverseClient(
            _settings(),
            runtime_client=runtime_client,
        )
        system_prompt = "外部へ出してはいけないシステムプロンプト"
        user_prompt = "外部へ出してはいけないユーザープロンプト"

        with self.assertLogs("app.llm.bedrock_client", level="INFO") as logs:
            client.generate_reply(system_prompt, user_prompt)

        log_text = "\n".join(logs.output)
        self.assertNotIn(system_prompt, log_text)
        self.assertNotIn(user_prompt, log_text)
        self.assertIn("呼び出しが完了しました", log_text)

    def test_empty_prompt_is_rejected_before_api_call(self):
        runtime_client = Mock()
        client = BedrockConverseClient(
            _settings(),
            runtime_client=runtime_client,
        )

        with self.assertRaisesRegex(ValueError, "system_promptは空にできません"):
            client.generate_reply("  ", "user")

        runtime_client.converse.assert_not_called()

    @patch.dict(
        os.environ,
        {
            "BEDROCK_MODEL_ID": "env.model-v1:0",
            "AWS_REGION": "us-west-2",
            "BEDROCK_MAX_TOKENS": "256",
            "BEDROCK_TEMPERATURE": "0.2",
        },
        clear=True,
    )
    def test_from_env_reads_bedrock_settings(self):
        runtime_client = Mock()
        runtime_client.converse.return_value = _response("返信")

        client = BedrockConverseClient.from_env(
            runtime_client=runtime_client
        )
        client.generate_reply("system", "user")

        kwargs = runtime_client.converse.call_args.kwargs
        self.assertEqual(kwargs["modelId"], "env.model-v1:0")
        self.assertEqual(kwargs["inferenceConfig"]["maxTokens"], 256)
        self.assertEqual(kwargs["inferenceConfig"]["temperature"], 0.2)

    @patch.dict(
        os.environ,
        {
            "BEDROCK_MODEL_ID": "env.model-v1:0",
            "AWS_DEFAULT_REGION": "eu-west-1",
            "BEDROCK_MAX_TOKENS": "128",
            "BEDROCK_TEMPERATURE": "0",
        },
        clear=True,
    )
    def test_default_region_is_used_when_aws_region_is_missing(self):
        settings = BedrockSettings.from_env()

        self.assertEqual(settings.region_name, "eu-west-1")

    def test_runtime_client_uses_bedrock_runtime_service_and_region(self):
        boto3 = Mock()
        expected_client = Mock()
        boto3.client.return_value = expected_client

        with patch.dict(sys.modules, {"boto3": boto3}):
            result = _create_runtime_client("ap-northeast-1")

        self.assertIs(result, expected_client)
        boto3.client.assert_called_once_with(
            "bedrock-runtime",
            region_name="ap-northeast-1",
        )


if __name__ == "__main__":
    unittest.main()
