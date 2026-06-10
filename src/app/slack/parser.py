"""Slack Events APIのペイロードをアプリ内メッセージへ変換する。"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class SlackMessage:
    """Worker Lambdaへ渡すユーザーメッセージ。"""

    event_id: str
    team_id: str
    channel_id: str
    user_id: str
    text: str
    event_ts: str
    thread_ts: str | None = None

    def to_dict(self) -> dict[str, str | None]:
        return asdict(self)


def parse_message_event(payload: Mapping[str, Any]) -> SlackMessage | None:
    """有効なユーザーのmessageイベントだけを抽出する。"""

    if payload.get("type") != "event_callback":
        return None

    event = payload.get("event")
    if not isinstance(event, Mapping) or event.get("type") != "message":
        return None

    if event.get("bot_id") or event.get("subtype"):
        return None

    text = event.get("text")
    if not isinstance(text, str) or not text.strip():
        return None

    required_values = {
        "event_id": payload.get("event_id"),
        "team_id": payload.get("team_id"),
        "channel_id": event.get("channel"),
        "user_id": event.get("user"),
        "event_ts": event.get("ts"),
    }
    if not all(isinstance(value, str) and value for value in required_values.values()):
        return None

    thread_ts = event.get("thread_ts")
    if not isinstance(thread_ts, str):
        thread_ts = None

    return SlackMessage(
        event_id=required_values["event_id"],
        team_id=required_values["team_id"],
        channel_id=required_values["channel_id"],
        user_id=required_values["user_id"],
        text=text.strip(),
        event_ts=required_values["event_ts"],
        thread_ts=thread_ts,
    )
