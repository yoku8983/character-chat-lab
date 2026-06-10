"""DynamoDBリポジトリで共有する小さな補助処理。"""

from __future__ import annotations

from typing import Any


def create_table(table_name: str) -> Any:
    """Lambdaランタイム同梱のboto3からDynamoDB Tableを生成する。"""

    import boto3

    return boto3.resource("dynamodb").Table(table_name)
