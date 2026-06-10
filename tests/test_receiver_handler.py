import hashlib
import hmac
import json
import unittest
from unittest.mock import Mock, patch

from app.config import Settings
from app.receiver_handler import lambda_handler

SECRET = "test-secret"
NOW = "1710000000"


class FakeSqsClient:
    def __init__(self):
        self.messages = []

    def send_message(self, **message):
        self.messages.append(message)


def _request(payload):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    digest = hmac.new(
        SECRET.encode(),
        f"v0:{NOW}:{body}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return {
        "headers": {
            "x-slack-request-timestamp": NOW,
            "X-Slack-Signature": f"v0={digest}",
        },
        "body": body,
    }


def _settings():
    return Settings(
        slack_signing_secret=SECRET,
        sqs_queue_url="https://sqs.example.test/queue",
    )


class ReceiverHandlerTest(unittest.TestCase):
    @patch("app.slack.signature.time.time", return_value=int(NOW))
    def test_url_verification_returns_challenge(self, _mock_time):
        event = _request(
            {"type": "url_verification", "challenge": "challenge-value"}
        )

        response = lambda_handler(event, None, settings=_settings())

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(
            json.loads(response["body"]),
            {"challenge": "challenge-value"},
        )

    @patch("app.slack.signature.time.time", return_value=int(NOW))
    def test_valid_message_is_enqueued(self, _mock_time):
        sqs = FakeSqsClient()
        payload = {
            "type": "event_callback",
            "event_id": "Ev123",
            "team_id": "T123",
            "event": {
                "type": "message",
                "user": "U123",
                "channel": "C123",
                "text": "こんにちは",
                "ts": "1710000000.000100",
            },
        }

        response = lambda_handler(
            _request(payload),
            None,
            settings=_settings(),
            sqs_client=sqs,
        )

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(len(sqs.messages), 1)
        self.assertEqual(sqs.messages[0]["QueueUrl"], _settings().sqs_queue_url)
        self.assertEqual(
            json.loads(sqs.messages[0]["MessageBody"])["text"],
            "こんにちは",
        )

    @patch("app.slack.signature.time.time", return_value=int(NOW))
    def test_processing_stages_and_retry_headers_are_logged(
        self,
        _mock_time,
    ):
        sqs = FakeSqsClient()
        payload = {
            "type": "event_callback",
            "event_id": "EvRetry",
            "team_id": "T123",
            "event": {
                "type": "message",
                "user": "U123",
                "channel": "C123",
                "text": "ログへ出してはいけない本文",
                "ts": "1710000000.000100",
            },
        }
        event = _request(payload)
        event["headers"]["X-Slack-Retry-Num"] = "1"
        event["headers"]["X-Slack-Retry-Reason"] = "http_timeout"
        context = Mock(aws_request_id="request-123")

        with patch("app.receiver_handler.logger.info") as log_info:
            response = lambda_handler(
                event,
                context,
                settings=_settings(),
                sqs_client=sqs,
            )

        self.assertEqual(response["statusCode"], 200)
        messages = [
            call.args[0].split(" {", maxsplit=1)[0]
            for call in log_info.call_args_list
        ]
        self.assertEqual(
            messages,
            [
                "Slackリクエストを受信しました",
                "Slack署名検証が完了しました",
                "SlackイベントのSQS送信を開始します",
                "SlackイベントのSQS送信が完了しました",
                "Slackへackを返却します",
            ],
        )
        received = log_info.call_args_list[0].kwargs["extra"]
        self.assertEqual(received["aws_request_id"], "request-123")
        self.assertEqual(received["slack_retry_num"], "1")
        self.assertEqual(received["slack_retry_reason"], "http_timeout")
        verified = log_info.call_args_list[1].kwargs["extra"]
        self.assertTrue(verified["slack_signature_valid"])
        sent = log_info.call_args_list[3].kwargs["extra"]
        self.assertIn("sqs_client_creation_ms", sent)
        self.assertIn("sqs_send_api_ms", sent)
        self.assertIn("sqs_stage_ms", sent)
        ack = log_info.call_args_list[4].kwargs["extra"]
        self.assertEqual(ack["receiver_outcome"], "enqueued")
        self.assertIn("receiver_elapsed_ms", ack)
        self.assertNotIn(
            "ログへ出してはいけない本文",
            repr(log_info.call_args_list),
        )

    @patch("app.slack.signature.time.time", return_value=int(NOW))
    def test_bot_message_is_acknowledged_without_enqueue(self, _mock_time):
        sqs = FakeSqsClient()
        payload = {
            "type": "event_callback",
            "event_id": "Ev123",
            "team_id": "T123",
            "event": {
                "type": "message",
                "bot_id": "B123",
                "channel": "C123",
                "text": "bot message",
                "ts": "1710000000.000100",
            },
        }

        response = lambda_handler(
            _request(payload),
            None,
            settings=_settings(),
            sqs_client=sqs,
        )

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(sqs.messages, [])


if __name__ == "__main__":
    unittest.main()
