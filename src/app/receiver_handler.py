"""Slack Events APIを受け付け、ユーザーメッセージをSQSへ送るLambda。"""

from __future__ import annotations

import base64
import json
from typing import Any

from app.config import Settings
from app.slack.parser import parse_message_event
from app.slack.signature import get_header, verify_slack_signature


def lambda_handler(
    event: dict[str, Any],
    context: Any,
    *,
    settings: Settings | None = None,
    sqs_client: Any = None,
) -> dict[str, Any]:
    """API Gatewayから受け取ったSlackイベントを処理する。"""

    del context
    body = _get_body(event)
    headers = event.get("headers")
    app_settings = settings or Settings.from_env()

    if not verify_slack_signature(
        signing_secret=app_settings.slack_signing_secret,
        timestamp=get_header(headers, "X-Slack-Request-Timestamp"),
        signature=get_header(headers, "X-Slack-Signature"),
        body=body,
    ):
        return _response(401, {"error": "署名を検証できませんでした"})

    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, TypeError):
        return _response(400, {"error": "JSON本文が不正です"})

    if not isinstance(payload, dict):
        return _response(400, {"error": "JSON本文はオブジェクトである必要があります"})

    if payload.get("type") == "url_verification":
        challenge = payload.get("challenge")
        if not isinstance(challenge, str):
            return _response(400, {"error": "challengeがありません"})
        return _response(200, {"challenge": challenge})

    message = parse_message_event(payload)
    if message is None:
        return _response(200, {"ok": True, "ignored": True})

    client = sqs_client or _create_sqs_client()
    client.send_message(
        QueueUrl=app_settings.sqs_queue_url,
        MessageBody=json.dumps(
            message.to_dict(),
            ensure_ascii=False,
            separators=(",", ":"),
        ),
    )
    return _response(200, {"ok": True})


def _get_body(event: dict[str, Any]) -> str:
    body = event.get("body", "")
    if not isinstance(body, str):
        return ""
    if event.get("isBase64Encoded"):
        try:
            return base64.b64decode(body, validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return ""
    return body


def _create_sqs_client() -> Any:
    # Lambdaランタイム同梱のboto3を、必要になるまで読み込まない。
    import boto3

    return boto3.client("sqs")


def _response(status_code: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(body, ensure_ascii=False),
    }
