import unittest
from unittest.mock import Mock

from app.db.messages import MessageRepository


class MessageRepositoryTest(unittest.TestCase):
    def test_save_message_puts_a_copy_of_the_item(self):
        table = Mock()
        repository = MessageRepository(table)
        message = {
            "session_id": "session-1",
            "created_at": "2026-06-10T10:00:00+00:00",
            "text": "こんにちは",
        }

        repository.save_message(message)

        table.put_item.assert_called_once_with(Item=message)
        self.assertIsNot(
            table.put_item.call_args.kwargs["Item"],
            message,
        )

    def test_get_recent_messages_returns_chronological_order(self):
        table = Mock()
        table.query.return_value = {
            "Items": [
                {"created_at": "2026-06-10T10:02:00+00:00", "text": "3"},
                {"created_at": "2026-06-10T10:01:00+00:00", "text": "2"},
                {"created_at": "2026-06-10T10:00:00+00:00", "text": "1"},
            ]
        }
        repository = MessageRepository(table)

        result = repository.get_recent_messages("session-1", 3)

        self.assertEqual([item["text"] for item in result], ["1", "2", "3"])
        table.query.assert_called_once_with(
            KeyConditionExpression="session_id = :session_id",
            ExpressionAttributeValues={":session_id": "session-1"},
            ScanIndexForward=False,
            Limit=3,
        )

    def test_get_recent_messages_rejects_non_positive_limit(self):
        repository = MessageRepository(Mock())

        with self.assertRaises(ValueError):
            repository.get_recent_messages("session-1", 0)


if __name__ == "__main__":
    unittest.main()
