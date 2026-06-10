"""会話メッセージを保存・取得するDynamoDBリポジトリ。"""

from __future__ import annotations

import os
from typing import Any

from app.db.common import create_table


class MessageRepository:
    """Messagesテーブルへのアクセスを提供する。"""

    def __init__(self, table: Any) -> None:
        self._table = table

    def save_message(self, message: dict[str, Any]) -> None:
        """メッセージを保存する。呼び出し元の辞書は変更しない。"""

        self._table.put_item(Item=dict(message))

    def get_recent_messages(
        self,
        session_id: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        """直近のメッセージを古いものから順に返す。"""

        if limit <= 0:
            raise ValueError("limitは1以上で指定してください")

        response = self._table.query(
            KeyConditionExpression="session_id = :session_id",
            ExpressionAttributeValues={":session_id": session_id},
            ScanIndexForward=False,
            Limit=limit,
        )
        items = response.get("Items", [])
        if not isinstance(items, list):
            return []
        return list(reversed(items))


def save_message(message: dict[str, Any]) -> None:
    """環境変数で指定されたMessagesテーブルへ保存する。"""

    MessageRepository(create_table(_messages_table_name())).save_message(message)


def get_recent_messages(
    session_id: str,
    limit: int,
) -> list[dict[str, Any]]:
    """環境変数で指定されたMessagesテーブルから履歴を取得する。"""

    return MessageRepository(
        create_table(_messages_table_name())
    ).get_recent_messages(session_id, limit)


def _messages_table_name() -> str:
    value = os.environ.get("MESSAGES_TABLE_NAME", "").strip()
    if not value:
        raise ValueError("環境変数 MESSAGES_TABLE_NAME が設定されていません")
    return value
