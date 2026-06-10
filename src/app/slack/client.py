"""Slack Web APIへメッセージを投稿するクライアント。"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage"


class SlackApiError(RuntimeError):
    """Slack Web APIの呼び出しに失敗したことを表す。"""

    def __init__(
        self,
        message: str,
        *,
        error_code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.error_code = error_code


class SlackClient:
    """Slackのchat.postMessageを呼び出す。"""

    def __init__(
        self,
        bot_token: str,
        *,
        opener: Callable[..., Any] = urlopen,
    ) -> None:
        if not isinstance(bot_token, str) or not bot_token.strip():
            raise ValueError("SLACK_BOT_TOKENは空にできません")
        self._bot_token = bot_token.strip()
        self._opener = opener

    def post_message(
        self,
        channel_id: str,
        text: str,
        *,
        thread_ts: str | None = None,
    ) -> dict[str, Any]:
        """指定チャンネルへ返信本文を投稿する。"""

        if not isinstance(channel_id, str) or not channel_id.strip():
            raise ValueError("channel_idは空にできません")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("textは空にできません")

        payload = {
            "channel": channel_id.strip(),
            "text": text.strip(),
        }
        if isinstance(thread_ts, str) and thread_ts.strip():
            payload["thread_ts"] = thread_ts.strip()

        request = Request(
            SLACK_POST_MESSAGE_URL,
            data=json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._bot_token}",
                "Content-Type": "application/json; charset=utf-8",
            },
            method="POST",
        )

        logger.info(
            "Slackへ返信を投稿します",
            extra={
                "slack_channel_id": channel_id,
                "slack_thread_reply": "thread_ts" in payload,
            },
        )

        try:
            with self._opener(request, timeout=10) as response:
                response_body = response.read().decode("utf-8")
            result = json.loads(response_body)
        except (HTTPError, URLError, TimeoutError, UnicodeDecodeError) as error:
            logger.error(
                "Slack Web APIへの接続に失敗しました",
                extra={"slack_channel_id": channel_id},
            )
            raise SlackApiError(
                "Slack Web APIへの接続に失敗しました"
            ) from error
        except json.JSONDecodeError as error:
            raise SlackApiError(
                "Slack Web APIから不正なJSON応答が返されました"
            ) from error

        if not isinstance(result, dict) or result.get("ok") is not True:
            error_code = (
                result.get("error") if isinstance(result, dict) else None
            )
            logger.error(
                "Slack chat.postMessageが失敗しました",
                extra={
                    "slack_channel_id": channel_id,
                    "slack_error_code": error_code,
                },
            )
            raise SlackApiError(
                "Slack chat.postMessageが失敗しました"
                + (f"（エラーコード: {error_code}）" if error_code else ""),
                error_code=error_code,
            )

        logger.info(
            "Slackへの返信投稿が完了しました",
            extra={
                "slack_channel_id": channel_id,
                "slack_message_ts": result.get("ts"),
            },
        )
        return result
