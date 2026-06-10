"""Slackから届いたHTTPリクエストの署名を検証する。"""

from __future__ import annotations

import hashlib
import hmac
import time
from collections.abc import Callable, Mapping

SLACK_SIGNATURE_VERSION = "v0"
DEFAULT_TOLERANCE_SECONDS = 60 * 5


def verify_slack_signature(
    *,
    signing_secret: str,
    timestamp: str | None,
    signature: str | None,
    body: str,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
    now: Callable[[], float] | None = None,
) -> bool:
    """Slack署名とタイムスタンプを検証する。"""

    if not timestamp or not signature:
        return False

    try:
        request_time = int(timestamp)
    except ValueError:
        return False

    current_time = now or time.time
    if abs(int(current_time()) - request_time) > tolerance_seconds:
        return False

    base_string = f"{SLACK_SIGNATURE_VERSION}:{timestamp}:{body}".encode("utf-8")
    digest = hmac.new(
        signing_secret.encode("utf-8"),
        base_string,
        hashlib.sha256,
    ).hexdigest()
    expected_signature = f"{SLACK_SIGNATURE_VERSION}={digest}"
    return hmac.compare_digest(expected_signature, signature)


def get_header(headers: Mapping[str, str] | None, name: str) -> str | None:
    """大文字と小文字を区別せずにHTTPヘッダーを取得する。"""

    if not headers:
        return None

    target = name.lower()
    for key, value in headers.items():
        if key.lower() == target:
            return value
    return None
