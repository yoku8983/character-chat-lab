"""キャラクター会話用のプロンプトを決定的に組み立てる。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

CHARACTER_CARD_SECTIONS = (
    ("口調", ("speech_style", "speaking_style", "tone")),
    ("性格・価値観", ("personality", "personality_values", "values")),
    ("行動ルール", ("behavior_rules", "rules")),
    ("参考発話例", ("example_dialogues", "sample_dialogues", "examples")),
    ("会話上の注意", ("conversation_notes", "cautions", "notes")),
)

USER_ROLES = {"user", "human"}
CHARACTER_ROLES = {"character", "assistant"}


def build_prompts(
    character_card: dict[str, Any],
    recent_messages: list[dict[str, Any]],
    latest_user_message: str,
) -> tuple[str, str]:
    """Bedrockへ渡すsystem promptとuser promptを返す。"""

    _validate_inputs(character_card, recent_messages, latest_user_message)

    system_prompt = _build_system_prompt(character_card)
    user_prompt = _build_user_prompt(
        recent_messages,
        latest_user_message.strip(),
    )
    return system_prompt, user_prompt


def build_prompt(
    character_card: dict[str, Any],
    recent_messages: list[dict[str, Any]],
    latest_user_message: str,
) -> tuple[str, str]:
    """単数形の名前でも同じPrompt Builderを利用できるようにする。"""

    return build_prompts(
        character_card,
        recent_messages,
        latest_user_message,
    )


def _validate_inputs(
    character_card: Any,
    recent_messages: Any,
    latest_user_message: Any,
) -> None:
    if not isinstance(character_card, dict):
        raise ValueError("character_cardは辞書で指定してください")

    name = _text_value(character_card.get("name"))
    summary = _text_value(character_card.get("summary"))
    if not name and not summary:
        raise ValueError(
            "character_cardにはnameまたはsummaryを指定してください"
        )

    if not isinstance(recent_messages, list):
        raise ValueError("recent_messagesは辞書のリストで指定してください")
    if not all(isinstance(message, dict) for message in recent_messages):
        raise ValueError("recent_messagesの各要素は辞書で指定してください")

    if not isinstance(latest_user_message, str) or not latest_user_message.strip():
        raise ValueError("latest_user_messageは空にできません")


def _build_system_prompt(character_card: Mapping[str, Any]) -> str:
    name = _text_value(character_card.get("name")) or "未設定"
    summary = _text_value(character_card.get("summary")) or "未設定"

    sections = [
        "あなたは以下のキャラクターとして会話してください。",
        "",
        "【キャラクター概要】",
        f"名前: {name}",
        f"概要: {summary}",
    ]

    for heading, field_names in CHARACTER_CARD_SECTIONS:
        sections.extend(
            [
                "",
                f"【{heading}】",
                _format_card_value(
                    _first_card_value(character_card, field_names)
                ),
            ]
        )

    sections.extend(
        [
            "",
            "【出力形式】",
            "キャラクターの返信本文だけをプレーンテキストで出力してください。",
            "説明、前置き、話者名、見出し、装飾、コードブロックは付けないでください。",
        ]
    )
    return "\n".join(sections)


def _build_user_prompt(
    recent_messages: Sequence[Mapping[str, Any]],
    latest_user_message: str,
) -> str:
    history_lines = _format_recent_messages(recent_messages)
    history = "\n".join(history_lines) if history_lines else "会話履歴はありません。"

    return "\n".join(
        [
            "【直近の会話】",
            history,
            "",
            "【ユーザーの最新発話】",
            latest_user_message,
        ]
    )


def _format_recent_messages(
    recent_messages: Sequence[Mapping[str, Any]],
) -> list[str]:
    indexed_messages = list(enumerate(recent_messages))
    ordered_messages = sorted(
        indexed_messages,
        key=lambda item: (
            _text_value(item[1].get("created_at")) or "",
            item[0],
        ),
    )

    lines = []
    for _, message in ordered_messages:
        role = _normalized_role(message.get("role") or message.get("speaker"))
        text = _text_value(message.get("text") or message.get("content"))
        if role and text:
            lines.append(f"{role}: {text}")
    return lines


def _normalized_role(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in USER_ROLES:
        return "User"
    if normalized in CHARACTER_ROLES:
        return "Character"
    return None


def _format_card_value(value: Any) -> str:
    if isinstance(value, str):
        return value.strip() or "未設定"
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        entries = [
            text
            for entry in value
            if (text := _text_value(entry))
        ]
        return "\n".join(f"- {entry}" for entry in entries) or "未設定"
    return "未設定"


def _first_card_value(
    character_card: Mapping[str, Any],
    field_names: Sequence[str],
) -> Any:
    for field_name in field_names:
        if field_name in character_card:
            return character_card[field_name]
    return None


def _text_value(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None
