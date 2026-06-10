import unittest
from unittest.mock import Mock

from app.db.processed_events import (
    PROCESSED_EVENT_TTL_SECONDS,
    ProcessedEventRepository,
)


class FakeClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class ProcessedEventRepositoryTest(unittest.TestCase):
    def test_mark_event_processed_uses_conditional_write_and_ttl(self):
        current_time = 1_750_000_000
        table = Mock()
        repository = ProcessedEventRepository(
            table,
            now=lambda: current_time,
        )

        result = repository.mark_event_processed("Ev123")

        self.assertTrue(result)
        kwargs = table.put_item.call_args.kwargs
        self.assertEqual(
            kwargs["ConditionExpression"],
            "attribute_not_exists(event_id)",
        )
        self.assertEqual(kwargs["Item"]["event_id"], "Ev123")
        self.assertEqual(
            kwargs["Item"]["expires_at"],
            current_time + PROCESSED_EVENT_TTL_SECONDS,
        )
        self.assertIn("processed_at", kwargs["Item"])

    def test_mark_event_processed_returns_false_for_duplicate(self):
        table = Mock()
        table.put_item.side_effect = FakeClientError(
            "ConditionalCheckFailedException"
        )
        repository = ProcessedEventRepository(table, now=lambda: 1_750_000_000)

        self.assertFalse(repository.mark_event_processed("Ev123"))

    def test_mark_event_processed_reraises_other_errors(self):
        table = Mock()
        table.put_item.side_effect = FakeClientError(
            "ProvisionedThroughputExceededException"
        )
        repository = ProcessedEventRepository(table, now=lambda: 1_750_000_000)

        with self.assertRaises(FakeClientError):
            repository.mark_event_processed("Ev123")

    def test_is_event_processed_returns_true_when_item_exists(self):
        table = Mock()
        table.get_item.return_value = {"Item": {"event_id": "Ev123"}}
        repository = ProcessedEventRepository(table)

        self.assertTrue(repository.is_event_processed("Ev123"))
        table.get_item.assert_called_once_with(
            Key={"event_id": "Ev123"},
            ConsistentRead=True,
        )

    def test_is_event_processed_returns_false_when_item_does_not_exist(self):
        table = Mock()
        table.get_item.return_value = {}
        repository = ProcessedEventRepository(table)

        self.assertFalse(repository.is_event_processed("Ev404"))


if __name__ == "__main__":
    unittest.main()
