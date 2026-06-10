"""既定キャラクターをCharactersテーブルへ投入する。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def main() -> None:
    args = _parse_args()
    item = _load_character(args.file)
    table = _create_table(args.table_name, args.region)
    table.put_item(Item=item)
    print(
        "既定キャラクターを投入しました: "
        f"table={args.table_name}, character_id={item['character_id']}"
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="既定キャラクターをDynamoDBへ投入します。",
    )
    parser.add_argument(
        "--table-name",
        required=True,
        help="Charactersテーブル名",
    )
    parser.add_argument(
        "--region",
        default=None,
        help="AWSリージョン。省略時はAWS CLIの設定を使用します。",
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=Path("seed/default_character.json"),
        help="投入するキャラクターJSON",
    )
    return parser.parse_args()


def _load_character(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as source:
        item = json.load(source)
    if not isinstance(item, dict):
        raise ValueError("キャラクターJSONはオブジェクトで指定してください")
    character_id = item.get("character_id")
    if not isinstance(character_id, str) or not character_id.strip():
        raise ValueError("character_idは空にできません")
    if not _text(item.get("name")) and not _text(item.get("summary")):
        raise ValueError("nameまたはsummaryを指定してください")
    return item


def _create_table(table_name: str, region: str | None) -> Any:
    import boto3

    resource = boto3.resource("dynamodb", region_name=region)
    return resource.Table(table_name)


def _text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


if __name__ == "__main__":
    main()
