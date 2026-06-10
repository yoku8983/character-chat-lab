import json
import unittest
from unittest.mock import Mock

from app.llm.bedrock_client import BedrockApiError
from app.slack.client import SlackApiError
from app.worker_handler import WorkerDependencies, lambda_handler


def _payload(**overrides):
    payload = {
        "event_id": "Ev123",
        "team_id": "T123",
        "channel_id": "C123",
        "user_id": "U123",
        "text": "こんにちは",
        "event_ts": "1710000000.000100",
        "thread_ts": "1710000000.000001",
    }
    payload.update(overrides)
    return payload


def _sqs_event(payload=None, *, message_id="msg-1", raw_body=None):
    body = (
        raw_body
        if raw_body is not None
        else json.dumps(payload or _payload(), ensure_ascii=False)
    )
    return {
        "Records": [
            {
                "messageId": message_id,
                "body": body,
            }
        ]
    }


def _dependencies():
    character_repository = Mock()
    character_repository.get_character.return_value = {
        "character_id": "default",
        "name": "ミナト",
        "summary": "案内役",
    }

    message_repository = Mock()
    message_repository.get_recent_messages.return_value = [
        {
            "session_id": "T123:C123",
            "created_at": "2024-03-09T15:59:00+00:00",
            "role": "user",
            "text": "前の質問",
            "event_id": "Ev122",
        },
        {
            "session_id": "T123:C123",
            "created_at": "2024-03-09T16:00:00.000100+00:00",
            "role": "user",
            "text": "こんにちは",
            "event_id": "Ev123",
        },
    ]

    processed_event_repository = Mock()
    processed_event_repository.is_event_processed.return_value = False
    processed_event_repository.mark_event_processed.return_value = True

    llm_client = Mock()
    llm_client.generate_reply.return_value = "こんにちは。今日はどうしましたか？"

    slack_client = Mock()
    prompt_builder = Mock(
        return_value=("システムプロンプト", "ユーザープロンプト")
    )

    return WorkerDependencies(
        character_repository=character_repository,
        message_repository=message_repository,
        processed_event_repository=processed_event_repository,
        llm_client=llm_client,
        slack_client=slack_client,
        default_character_id="default",
        message_history_limit=10,
        prompt_builder=prompt_builder,
        now=lambda: 1710000001,
    )


class WorkerHandlerTest(unittest.TestCase):
    def test_valid_event_runs_full_conversation_flow(self):
        dependencies = _dependencies()

        result = lambda_handler(
            _sqs_event(_payload()),
            None,
            dependencies=dependencies,
        )

        self.assertEqual(result, {"batchItemFailures": []})
        dependencies.processed_event_repository.is_event_processed.assert_called_once_with(
            "Ev123"
        )
        dependencies.processed_event_repository.mark_event_processed.assert_called_once_with(
            "Ev123"
        )
        self.assertEqual(
            dependencies.message_repository.save_message.call_count,
            2,
        )

        user_message = (
            dependencies.message_repository.save_message.call_args_list[0].args[0]
        )
        self.assertEqual(user_message["session_id"], "T123:C123")
        self.assertEqual(user_message["role"], "user")
        self.assertEqual(user_message["text"], "こんにちは")
        self.assertEqual(user_message["event_id"], "Ev123")

        dependencies.character_repository.get_character.assert_called_once_with(
            "default"
        )
        dependencies.message_repository.get_recent_messages.assert_called_once_with(
            "T123:C123",
            10,
        )
        prompt_history = dependencies.prompt_builder.call_args.args[1]
        self.assertEqual(len(prompt_history), 1)
        self.assertEqual(prompt_history[0]["event_id"], "Ev122")
        self.assertEqual(
            dependencies.prompt_builder.call_args.args[2],
            "こんにちは",
        )
        dependencies.llm_client.generate_reply.assert_called_once_with(
            "システムプロンプト",
            "ユーザープロンプト",
        )

        reply_message = (
            dependencies.message_repository.save_message.call_args_list[1].args[0]
        )
        self.assertEqual(reply_message["role"], "assistant")
        self.assertEqual(
            reply_message["text"],
            "こんにちは。今日はどうしましたか？",
        )
        dependencies.slack_client.post_message.assert_called_once_with(
            "C123",
            "こんにちは。今日はどうしましたか？",
            thread_ts="1710000000.000001",
        )

    def test_duplicate_event_skips_bedrock_and_slack(self):
        dependencies = _dependencies()
        dependencies.processed_event_repository.is_event_processed.return_value = (
            True
        )

        result = lambda_handler(
            _sqs_event(_payload()),
            None,
            dependencies=dependencies,
        )

        self.assertEqual(result, {"batchItemFailures": []})
        dependencies.processed_event_repository.mark_event_processed.assert_not_called()
        dependencies.message_repository.save_message.assert_not_called()
        dependencies.llm_client.generate_reply.assert_not_called()
        dependencies.slack_client.post_message.assert_not_called()

    def test_conditional_duplicate_skips_bedrock_and_slack(self):
        dependencies = _dependencies()
        dependencies.processed_event_repository.mark_event_processed.return_value = (
            False
        )

        result = lambda_handler(
            _sqs_event(_payload()),
            None,
            dependencies=dependencies,
        )

        self.assertEqual(result, {"batchItemFailures": []})
        dependencies.message_repository.save_message.assert_not_called()
        dependencies.llm_client.generate_reply.assert_not_called()
        dependencies.slack_client.post_message.assert_not_called()

    def test_invalid_payload_is_logged_and_skipped(self):
        dependencies = _dependencies()

        with self.assertLogs("app.worker_handler", level="WARNING"):
            result = lambda_handler(
                _sqs_event(raw_body="{invalid"),
                None,
                dependencies=dependencies,
            )

        self.assertEqual(result, {"batchItemFailures": []})
        dependencies.processed_event_repository.is_event_processed.assert_not_called()

    def test_missing_character_card_returns_batch_failure(self):
        dependencies = _dependencies()
        dependencies.character_repository.get_character.return_value = None

        with self.assertLogs("app.worker_handler", level="ERROR"):
            result = lambda_handler(
                _sqs_event(_payload(), message_id="missing-character"),
                None,
                dependencies=dependencies,
            )

        self.assertEqual(
            result,
            {
                "batchItemFailures": [
                    {"itemIdentifier": "missing-character"}
                ]
            },
        )
        dependencies.llm_client.generate_reply.assert_not_called()
        dependencies.slack_client.post_message.assert_not_called()

    def test_bedrock_error_is_logged_and_returned_as_batch_failure(self):
        dependencies = _dependencies()
        dependencies.llm_client.generate_reply.side_effect = BedrockApiError(
            "Bedrock失敗"
        )

        with self.assertLogs("app.worker_handler", level="ERROR") as logs:
            result = lambda_handler(
                _sqs_event(_payload(), message_id="bedrock-failure"),
                None,
                dependencies=dependencies,
            )

        self.assertEqual(
            result["batchItemFailures"],
            [{"itemIdentifier": "bedrock-failure"}],
        )
        self.assertIn("Bedrockによる返信生成に失敗", "\n".join(logs.output))
        dependencies.slack_client.post_message.assert_not_called()

    def test_slack_error_is_logged_and_returned_as_batch_failure(self):
        dependencies = _dependencies()
        dependencies.slack_client.post_message.side_effect = SlackApiError(
            "Slack失敗"
        )

        with self.assertLogs("app.worker_handler", level="ERROR") as logs:
            result = lambda_handler(
                _sqs_event(_payload(), message_id="slack-failure"),
                None,
                dependencies=dependencies,
            )

        self.assertEqual(
            result["batchItemFailures"],
            [{"itemIdentifier": "slack-failure"}],
        )
        self.assertIn("Slackへの返信投稿に失敗", "\n".join(logs.output))


if __name__ == "__main__":
    unittest.main()
