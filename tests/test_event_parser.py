import unittest

from app.slack.parser import parse_message_event


def _payload(**event_overrides):
    event = {
        "type": "message",
        "user": "U123",
        "channel": "C123",
        "text": "  こんにちは  ",
        "ts": "1710000000.000100",
    }
    event.update(event_overrides)
    return {
        "type": "event_callback",
        "event_id": "Ev123",
        "team_id": "T123",
        "event": event,
    }


class EventParserTest(unittest.TestCase):
    def test_user_message_is_parsed(self):
        message = parse_message_event(_payload(thread_ts="1710000000.000001"))

        self.assertIsNotNone(message)
        self.assertEqual(message.event_id, "Ev123")
        self.assertEqual(message.team_id, "T123")
        self.assertEqual(message.channel_id, "C123")
        self.assertEqual(message.user_id, "U123")
        self.assertEqual(message.text, "こんにちは")
        self.assertEqual(message.thread_ts, "1710000000.000001")

    def test_bot_message_is_ignored(self):
        self.assertIsNone(parse_message_event(_payload(bot_id="B123")))

    def test_message_with_subtype_is_ignored(self):
        self.assertIsNone(parse_message_event(_payload(subtype="message_changed")))

    def test_empty_message_is_ignored(self):
        self.assertIsNone(parse_message_event(_payload(text="   ")))

    def test_non_message_event_is_ignored(self):
        self.assertIsNone(parse_message_event(_payload(type="reaction_added")))


if __name__ == "__main__":
    unittest.main()
