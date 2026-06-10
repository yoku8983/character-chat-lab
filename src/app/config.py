"""環境変数からアプリケーション設定を読み込む。"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    """Receiver Lambdaが利用する設定。"""

    slack_signing_secret: str
    sqs_queue_url: str

    @classmethod
    def from_env(cls) -> "Settings":
        """必須の環境変数を検証して設定を返す。"""

        return cls(
            slack_signing_secret=_required_env("SLACK_SIGNING_SECRET"),
            sqs_queue_url=_required_env("SQS_QUEUE_URL"),
        )


@dataclass(frozen=True)
class DynamoDbSettings:
    """将来のWorker Lambdaが利用するDynamoDB設定。"""

    characters_table_name: str
    messages_table_name: str
    processed_events_table_name: str
    default_character_id: str
    message_history_limit: int

    @classmethod
    def from_env(cls) -> "DynamoDbSettings":
        """DynamoDB関連の環境変数を検証して設定を返す。"""

        return cls(
            characters_table_name=_required_env("CHARACTERS_TABLE_NAME"),
            messages_table_name=_required_env("MESSAGES_TABLE_NAME"),
            processed_events_table_name=_required_env(
                "PROCESSED_EVENTS_TABLE_NAME"
            ),
            default_character_id=_required_env("DEFAULT_CHARACTER_ID"),
            message_history_limit=_positive_int_env("MESSAGE_HISTORY_LIMIT"),
        )


@dataclass(frozen=True)
class BedrockSettings:
    """Amazon Bedrock Converse APIの設定。"""

    model_id: str
    region_name: str
    max_tokens: int
    temperature: float

    @classmethod
    def from_env(cls) -> "BedrockSettings":
        """Bedrock関連の環境変数を検証して設定を返す。"""

        region_name = (
            os.environ.get("AWS_REGION", "").strip()
            or os.environ.get("AWS_DEFAULT_REGION", "").strip()
        )
        if not region_name:
            raise ValueError(
                "環境変数 AWS_REGION または AWS_DEFAULT_REGION "
                "を設定してください"
            )

        return cls(
            model_id=_required_env("BEDROCK_MODEL_ID"),
            region_name=region_name,
            max_tokens=_positive_int_env("BEDROCK_MAX_TOKENS"),
            temperature=_temperature_env("BEDROCK_TEMPERATURE"),
        )


@dataclass(frozen=True)
class WorkerSettings:
    """Worker Lambda固有の設定。"""

    slack_bot_token: str
    default_character_id: str
    message_history_limit: int

    @classmethod
    def from_env(cls) -> "WorkerSettings":
        """Worker関連の環境変数を検証して設定を返す。"""

        return cls(
            slack_bot_token=_required_env("SLACK_BOT_TOKEN"),
            default_character_id=_required_env("DEFAULT_CHARACTER_ID"),
            message_history_limit=_positive_int_env("MESSAGE_HISTORY_LIMIT"),
        )


def _required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"環境変数 {name} が設定されていません")
    return value


def _positive_int_env(name: str) -> int:
    value = _required_env(name)
    try:
        parsed = int(value)
    except ValueError as error:
        raise ValueError(f"環境変数 {name} は整数で指定してください") from error
    if parsed <= 0:
        raise ValueError(f"環境変数 {name} は1以上で指定してください")
    return parsed


def _temperature_env(name: str) -> float:
    value = _required_env(name)
    try:
        parsed = float(value)
    except ValueError as error:
        raise ValueError(
            f"環境変数 {name} は数値で指定してください"
        ) from error
    if not 0.0 <= parsed <= 1.0:
        raise ValueError(
            f"環境変数 {name} は0.0以上1.0以下で指定してください"
        )
    return parsed
