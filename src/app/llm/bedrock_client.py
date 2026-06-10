"""Amazon Bedrock Converse APIを利用するLLM Client。"""

from __future__ import annotations

import logging
from typing import Any

from app.config import BedrockSettings
from app.llm.base import LlmClient

logger = logging.getLogger(__name__)


class BedrockError(RuntimeError):
    """Bedrock Clientで発生したエラーの基底クラス。"""


class BedrockApiError(BedrockError):
    """Bedrock Converse APIの呼び出しに失敗したことを表す。"""

    def __init__(
        self,
        message: str,
        *,
        error_code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.error_code = error_code


class BedrockEmptyResponseError(BedrockError):
    """Bedrockが有効な返信本文を返さなかったことを表す。"""


class BedrockConverseClient(LlmClient):
    """boto3のbedrock-runtimeクライアントで返信を生成する。"""

    def __init__(
        self,
        settings: BedrockSettings,
        *,
        runtime_client: Any = None,
    ) -> None:
        self._settings = settings
        self._runtime_client = runtime_client or _create_runtime_client(
            settings.region_name
        )

    @classmethod
    def from_env(cls, *, runtime_client: Any = None) -> "BedrockConverseClient":
        """環境変数から設定を読み込んでクライアントを生成する。"""

        return cls(
            BedrockSettings.from_env(),
            runtime_client=runtime_client,
        )

    def generate_reply(self, system_prompt: str, user_prompt: str) -> str:
        """Converse APIを呼び出して、返信本文だけを返す。"""

        _validate_prompt(system_prompt, "system_prompt")
        _validate_prompt(user_prompt, "user_prompt")

        logger.info(
            "Bedrock Converse APIを呼び出します",
            extra={
                "bedrock_model_id": self._settings.model_id,
                "aws_region": self._settings.region_name,
                "bedrock_max_tokens": self._settings.max_tokens,
                "bedrock_temperature": self._settings.temperature,
            },
        )

        try:
            response = self._runtime_client.converse(
                modelId=self._settings.model_id,
                system=[{"text": system_prompt}],
                messages=[
                    {
                        "role": "user",
                        "content": [{"text": user_prompt}],
                    }
                ],
                inferenceConfig={
                    "maxTokens": self._settings.max_tokens,
                    "temperature": self._settings.temperature,
                },
            )
        except Exception as error:
            error_code = _aws_error_code(error)
            logger.error(
                "Bedrock Converse APIの呼び出しに失敗しました",
                extra={
                    "bedrock_model_id": self._settings.model_id,
                    "aws_region": self._settings.region_name,
                    "aws_error_code": error_code,
                },
            )
            raise BedrockApiError(
                "Bedrock Converse APIの呼び出しに失敗しました"
                + (f"（エラーコード: {error_code}）" if error_code else ""),
                error_code=error_code,
            ) from error

        reply = _extract_reply_text(response)
        if not reply:
            raise BedrockEmptyResponseError(
                "Bedrockから返信本文が返されませんでした"
            )

        usage = response.get("usage", {})
        metrics = response.get("metrics", {})
        logger.info(
            "Bedrock Converse APIの呼び出しが完了しました",
            extra={
                "bedrock_model_id": self._settings.model_id,
                "bedrock_stop_reason": response.get("stopReason"),
                "bedrock_input_tokens": usage.get("inputTokens"),
                "bedrock_output_tokens": usage.get("outputTokens"),
                "bedrock_latency_ms": metrics.get("latencyMs"),
            },
        )
        return reply


def generate_reply(system_prompt: str, user_prompt: str) -> str:
    """環境変数で設定したBedrock Clientから返信を生成する。"""

    return BedrockConverseClient.from_env().generate_reply(
        system_prompt,
        user_prompt,
    )


def _create_runtime_client(region_name: str) -> Any:
    import boto3

    return boto3.client("bedrock-runtime", region_name=region_name)


def _validate_prompt(value: Any, name: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name}は空にできません")


def _extract_reply_text(response: Any) -> str:
    if not isinstance(response, dict):
        return ""

    output = response.get("output")
    if not isinstance(output, dict):
        return ""
    message = output.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if not isinstance(content, list):
        return ""

    text_parts = []
    for block in content:
        if not isinstance(block, dict):
            continue
        text = block.get("text")
        if isinstance(text, str) and text.strip():
            text_parts.append(text.strip())
    return "\n".join(text_parts).strip()


def _aws_error_code(error: Exception) -> str | None:
    response = getattr(error, "response", None)
    if not isinstance(response, dict):
        return None
    error_data = response.get("Error")
    if not isinstance(error_data, dict):
        return None
    code = error_data.get("Code")
    return code if isinstance(code, str) and code else None
