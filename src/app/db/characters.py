"""キャラクター設定を読み込むDynamoDBリポジトリ。"""

from __future__ import annotations

import os
from typing import Any

from app.db.common import create_table


class CharacterRepository:
    """Charactersテーブルへのアクセスを提供する。"""

    def __init__(self, table: Any) -> None:
        self._table = table

    def get_character(self, character_id: str) -> dict[str, Any] | None:
        """IDに対応するキャラクターを返す。存在しない場合はNoneを返す。"""

        response = self._table.get_item(Key={"character_id": character_id})
        item = response.get("Item")
        return item if isinstance(item, dict) else None


def get_character(character_id: str) -> dict[str, Any] | None:
    """環境変数で指定されたCharactersテーブルから取得する。"""

    table_name = _required_table_name("CHARACTERS_TABLE_NAME")
    return CharacterRepository(create_table(table_name)).get_character(character_id)


def _required_table_name(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"環境変数 {name} が設定されていません")
    return value
