"""Slackイベントの重複処理を防ぐDynamoDBリポジトリ。"""

from __future__ import annotations

import os
import time
from datetime import UTC, datetime
from typing import Any, Callable

from app.db.common import create_table

PROCESSED_EVENT_TTL_SECONDS = 60 * 60 * 24 * 7


class ProcessedEventRepository:
    """Processed Eventsテーブルへのアクセスを提供する。"""

    def __init__(
        self,
        table: Any,
        *,
        now: Callable[[], float] = time.time,
    ) -> None:
        self._table = table
        self._now = now

    def mark_event_processed(self, event_id: str) -> bool:
        """未登録のイベントだけを記録し、登録できた場合はTrueを返す。"""

        current_time = int(self._now())
        item = {
            "event_id": event_id,
            "processed_at": datetime.fromtimestamp(
                current_time,
                tz=UTC,
            ).isoformat(),
            "expires_at": current_time + PROCESSED_EVENT_TTL_SECONDS,
        }

        try:
            self._table.put_item(
                Item=item,
                ConditionExpression="attribute_not_exists(event_id)",
            )
        except Exception as error:
            if _is_conditional_check_failure(error):
                return False
            raise
        return True

    def is_event_processed(self, event_id: str) -> bool:
        """イベントIDがすでに記録されているかを返す。"""

        response = self._table.get_item(
            Key={"event_id": event_id},
            ConsistentRead=True,
        )
        return "Item" in response


def mark_event_processed(event_id: str) -> bool:
    """環境変数で指定されたテーブルへ処理済みイベントを記録する。"""

    return ProcessedEventRepository(
        create_table(_processed_events_table_name())
    ).mark_event_processed(event_id)


def is_event_processed(event_id: str) -> bool:
    """環境変数で指定されたテーブルの処理済み状態を確認する。"""

    return ProcessedEventRepository(
        create_table(_processed_events_table_name())
    ).is_event_processed(event_id)


def _is_conditional_check_failure(error: Exception) -> bool:
    response = getattr(error, "response", None)
    if not isinstance(response, dict):
        return False
    error_data = response.get("Error", {})
    return (
        isinstance(error_data, dict)
        and error_data.get("Code") == "ConditionalCheckFailedException"
    )


def _processed_events_table_name() -> str:
    value = os.environ.get("PROCESSED_EVENTS_TABLE_NAME", "").strip()
    if not value:
        raise ValueError(
            "環境変数 PROCESSED_EVENTS_TABLE_NAME が設定されていません"
        )
    return value
