import hashlib
import hmac
import json
import unittest
from unittest.mock import patch

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
