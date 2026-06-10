"""Slack Events APIを受け付け、ユーザーメッセージをSQSへ送るLambda。"""

from __future__ import annotations

import base64
import json
import logging
import time
from typing import Any

from app.config import Settings
from app.slack.parser import parse_message_event
from app.slack.signature import get_header, verify_slack_signature

logger = logging.getLogger(__name__)


def lambda_handler(
    event: dict[str, Any],
    context: Any,
    *,
    settings: Settings | None = None,
    sqs_client: Any = None,
) -> dict[str, Any]:
    """API Gatewayから受け取ったSlackイベントを処理する。"""

    started_at = time.perf_counter()
    body = _get_body(event)
    headers = event.get("headers")
    retry_num = get_header(headers, "X-Slack-Retry-Num")
    retry_reason = get_header(headers, "X-Slack-Retry-Reason")
    _log_info(
        "Slackリクエストを受信しました",
        {
            "aws_request_id": getattr(context, "aws_request_id", None),
            "request_body_bytes": len(body.encode("utf-8")),
            "request_is_base64_encoded": bool(event.get("isBase64Encoded")),
            "slack_retry_num": retry_num,
            "slack_retry_reason": retry_reason,
        },
    )

    app_settings = settings or Settings.from_env()

    verification_started_at = time.perf_counter()
    signature_valid = verify_slack_signature(
        signing_secret=app_settings.slack_signing_secret,
        timestamp=get_header(headers, "X-Slack-Request-Timestamp"),
        signature=get_header(headers, "X-Slack-Signature"),
        body=body,
    )
    _log_info(
        "Slack署名検証が完了しました",
        {
            "slack_signature_valid": signature_valid,
            "signature_verification_ms": _elapsed_ms(
                verification_started_at
            ),
        },
    )
    if not signature_valid:
        return _ack_response(
            401,
            {"error": "署名を検証できませんでした"},
            started_at=started_at,
            outcome="invalid_signature",
        )

    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, TypeError):
        return _ack_response(
            400,
            {"error": "JSON本文が不正です"},
            started_at=started_at,
            outcome="invalid_json",
        )

    if not isinstance(payload, dict):
        return _ack_response(
            400,
            {"error": "JSON本文はオブジェクトである必要があります"},
            started_at=started_at,
            outcome="invalid_payload",
        )

    if payload.get("type") == "url_verification":
        challenge = payload.get("challenge")
        if not isinstance(challenge, str):
            return _ack_response(
                400,
                {"error": "challengeがありません"},
                started_at=started_at,
                outcome="missing_challenge",
            )
        return _ack_response(
            200,
            {"challenge": challenge},
            started_at=started_at,
            outcome="url_verification",
        )

    message = parse_message_event(payload)
    if message is None:
        return _ack_response(
            200,
            {"ok": True, "ignored": True},
            started_at=started_at,
            outcome="ignored",
        )

    sqs_stage_started_at = time.perf_counter()
    _log_info(
        "SlackイベントのSQS送信を開始します",
        {"slack_event_id": message.event_id},
    )
    client_creation_started_at = time.perf_counter()
    client = sqs_client or _create_sqs_client()
    client_creation_ms = _elapsed_ms(client_creation_started_at)
    send_api_started_at = time.perf_counter()
    client.send_message(
        QueueUrl=app_settings.sqs_queue_url,
        MessageBody=json.dumps(
            message.to_dict(),
            ensure_ascii=False,
            separators=(",", ":"),
        ),
    )
    _log_info(
        "SlackイベントのSQS送信が完了しました",
        {
            "slack_event_id": message.event_id,
            "sqs_client_creation_ms": client_creation_ms,
            "sqs_send_api_ms": _elapsed_ms(send_api_started_at),
            "sqs_stage_ms": _elapsed_ms(sqs_stage_started_at),
        },
    )
    return _ack_response(
        200,
        {"ok": True},
        started_at=started_at,
        outcome="enqueued",
    )


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


def _ack_response(
    status_code: int,
    body: dict[str, Any],
    *,
    started_at: float,
    outcome: str,
) -> dict[str, Any]:
    _log_info(
        "Slackへackを返却します",
        {
            "http_status_code": status_code,
            "receiver_outcome": outcome,
            "receiver_elapsed_ms": _elapsed_ms(started_at),
        },
    )
    return _response(status_code, body)


def _elapsed_ms(started_at: float) -> float:
    return round((time.perf_counter() - started_at) * 1000, 3)


def _log_info(message: str, fields: dict[str, Any]) -> None:
    structured_fields = json.dumps(
        fields,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    logger.info(f"{message} {structured_fields}", extra=fields)
