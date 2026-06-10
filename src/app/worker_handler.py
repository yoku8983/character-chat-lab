"""SQSメッセージからキャラクター返信を生成するWorker Lambda。"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Callable

from app.config import DynamoDbSettings, WorkerSettings
from app.db.characters import CharacterRepository
from app.db.common import create_table
from app.db.messages import MessageRepository
from app.db.processed_events import ProcessedEventRepository
from app.llm.base import LlmClient
from app.llm.bedrock_client import BedrockConverseClient, BedrockError
from app.llm.prompt_builder import build_prompts
from app.slack.client import SlackApiError, SlackClient
from app.slack.parser import SlackMessage

logger = logging.getLogger(__name__)


class WorkerProcessingError(RuntimeError):
    """Workerが有効なイベントを処理できなかったことを表す。"""


@dataclass(frozen=True)
class WorkerDependencies:
    """Workerの外部依存をまとめ、単体テストで差し替え可能にする。"""

    character_repository: CharacterRepository
    message_repository: MessageRepository
    processed_event_repository: ProcessedEventRepository
    llm_client: LlmClient
    slack_client: SlackClient
    default_character_id: str
    message_history_limit: int
    prompt_builder: Callable[
        [dict[str, Any], list[dict[str, Any]], str],
        tuple[str, str],
    ] = build_prompts
    now: Callable[[], float] = time.time


def lambda_handler(
    event: dict[str, Any],
    context: Any,
    *,
    dependencies: WorkerDependencies | None = None,
) -> dict[str, list[dict[str, str]]]:
    """SQSバッチを処理し、再試行対象だけを部分バッチ応答で返す。"""

    del context
    records = event.get("Records", [])
    if not isinstance(records, list):
        logger.warning("SQSイベントのRecordsが不正なためスキップします")
        return {"batchItemFailures": []}

    worker_dependencies = dependencies or _create_dependencies()
    failures = []

    for record in records:
        message_id = _message_id(record)
        try:
            message = _parse_sqs_record(record)
            if message is None:
                logger.warning(
                    "不正なSQSメッセージをスキップします",
                    extra={"sqs_message_id": message_id},
                )
                continue
            _process_message(message, worker_dependencies)
        except (BedrockError, SlackApiError, WorkerProcessingError) as error:
            logger.error(
                "SQSメッセージの処理に失敗しました",
                extra={
                    "sqs_message_id": message_id,
                    "worker_error_type": type(error).__name__,
                },
            )
            if message_id:
                failures.append({"itemIdentifier": message_id})
        except Exception:
            logger.exception(
                "SQSメッセージの処理中に予期しないエラーが発生しました",
                extra={"sqs_message_id": message_id},
            )
            if message_id:
                failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": failures}


def _process_message(
    message: SlackMessage,
    dependencies: WorkerDependencies,
) -> None:
    session_id = build_session_id(message.team_id, message.channel_id)

    if dependencies.processed_event_repository.is_event_processed(
        message.event_id
    ):
        logger.info(
            "処理済みのSlackイベントをスキップします",
            extra={"slack_event_id": message.event_id},
        )
        return

    if not dependencies.processed_event_repository.mark_event_processed(
        message.event_id
    ):
        logger.info(
            "同時処理済みのSlackイベントをスキップします",
            extra={"slack_event_id": message.event_id},
        )
        return

    user_message = {
        "session_id": session_id,
        "created_at": _slack_timestamp_to_iso(message.event_ts),
        "role": "user",
        "text": message.text,
        "event_id": message.event_id,
        "user_id": message.user_id,
    }
    dependencies.message_repository.save_message(user_message)

    character_card = dependencies.character_repository.get_character(
        dependencies.default_character_id
    )
    if character_card is None:
        logger.error(
            "既定のキャラクターカードが見つかりません",
            extra={
                "character_id": dependencies.default_character_id,
                "slack_event_id": message.event_id,
            },
        )
        raise WorkerProcessingError(
            "既定のキャラクターカードが見つかりません"
            f"（character_id: {dependencies.default_character_id}）"
        )

    recent_messages = dependencies.message_repository.get_recent_messages(
        session_id,
        dependencies.message_history_limit,
    )
    prompt_history = [
        item
        for item in recent_messages
        if item.get("event_id") != message.event_id
    ]
    system_prompt, user_prompt = dependencies.prompt_builder(
        character_card,
        prompt_history,
        message.text,
    )

    try:
        reply = dependencies.llm_client.generate_reply(
            system_prompt,
            user_prompt,
        )
    except BedrockError:
        logger.error(
            "Bedrockによる返信生成に失敗しました",
            extra={"slack_event_id": message.event_id},
        )
        raise

    reply_message = {
        "session_id": session_id,
        "created_at": _utc_iso(dependencies.now()),
        "role": "assistant",
        "text": reply,
        "event_id": message.event_id,
        "character_id": dependencies.default_character_id,
    }
    dependencies.message_repository.save_message(reply_message)

    try:
        dependencies.slack_client.post_message(
            message.channel_id,
            reply,
            thread_ts=message.thread_ts,
        )
    except SlackApiError:
        logger.error(
            "Slackへの返信投稿に失敗しました",
            extra={"slack_event_id": message.event_id},
        )
        raise


def build_session_id(team_id: str, channel_id: str) -> str:
    """Slackワークスペースとチャンネルから会話IDを作る。"""

    return f"{team_id}:{channel_id}"


def _parse_sqs_record(record: Any) -> SlackMessage | None:
    if not isinstance(record, dict):
        return None
    body = record.get("body")
    if not isinstance(body, str):
        return None
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None

    required_fields = (
        "event_id",
        "team_id",
        "channel_id",
        "user_id",
        "text",
        "event_ts",
    )
    values = {}
    for field_name in required_fields:
        value = payload.get(field_name)
        if not isinstance(value, str) or not value.strip():
            return None
        values[field_name] = value.strip()

    thread_ts = payload.get("thread_ts")
    if not isinstance(thread_ts, str) or not thread_ts.strip():
        thread_ts = None

    return SlackMessage(
        **values,
        thread_ts=thread_ts,
    )


def _create_dependencies() -> WorkerDependencies:
    db_settings = DynamoDbSettings.from_env()
    worker_settings = WorkerSettings.from_env()
    return WorkerDependencies(
        character_repository=CharacterRepository(
            create_table(db_settings.characters_table_name)
        ),
        message_repository=MessageRepository(
            create_table(db_settings.messages_table_name)
        ),
        processed_event_repository=ProcessedEventRepository(
            create_table(db_settings.processed_events_table_name)
        ),
        llm_client=BedrockConverseClient.from_env(),
        slack_client=SlackClient(worker_settings.slack_bot_token),
        default_character_id=worker_settings.default_character_id,
        message_history_limit=worker_settings.message_history_limit,
    )


def _message_id(record: Any) -> str | None:
    if not isinstance(record, dict):
        return None
    value = record.get("messageId")
    return value if isinstance(value, str) and value else None


def _slack_timestamp_to_iso(timestamp: str) -> str:
    try:
        return _utc_iso(float(timestamp))
    except ValueError as error:
        raise WorkerProcessingError(
            "Slackイベントのevent_tsが不正です"
        ) from error


def _utc_iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=UTC).isoformat(
        timespec="microseconds"
    )
