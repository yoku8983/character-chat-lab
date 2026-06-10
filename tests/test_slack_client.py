import json
import unittest
from unittest.mock import Mock

from app.slack.client import (
    SLACK_POST_MESSAGE_URL,
    SlackApiError,
    SlackClient,
)


class FakeResponse:
    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return self._body


class SlackClientTest(unittest.TestCase):
    def test_post_message_sends_expected_request(self):
        opener = Mock(return_value=FakeResponse({"ok": True, "ts": "123.456"}))
        client = SlackClient("xoxb-test-token", opener=opener)

        result = client.post_message(
            "C123",
            "  こんにちは  ",
            thread_ts="111.222",
        )

        self.assertTrue(result["ok"])
        request = opener.call_args.args[0]
        self.assertEqual(request.full_url, SLACK_POST_MESSAGE_URL)
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(
            request.get_header("Authorization"),
            "Bearer xoxb-test-token",
        )
        self.assertEqual(
            json.loads(request.data.decode("utf-8")),
            {
                "channel": "C123",
                "text": "こんにちは",
                "thread_ts": "111.222",
            },
        )
        self.assertEqual(opener.call_args.kwargs["timeout"], 10)

    def test_post_message_omits_thread_ts_when_not_supplied(self):
        opener = Mock(return_value=FakeResponse({"ok": True}))
        client = SlackClient("xoxb-test-token", opener=opener)

        client.post_message("C123", "返信")

        request = opener.call_args.args[0]
        self.assertNotIn(
            "thread_ts",
            json.loads(request.data.decode("utf-8")),
        )

    def test_slack_api_error_is_wrapped(self):
        opener = Mock(
            return_value=FakeResponse(
                {"ok": False, "error": "channel_not_found"}
            )
        )
        client = SlackClient("xoxb-test-token", opener=opener)

        with self.assertLogs("app.slack.client", level="ERROR"):
            with self.assertRaises(SlackApiError) as context:
                client.post_message("C404", "返信")

        self.assertEqual(
            context.exception.error_code,
            "channel_not_found",
        )
        self.assertIn("chat.postMessage", str(context.exception))


if __name__ == "__main__":
    unittest.main()
