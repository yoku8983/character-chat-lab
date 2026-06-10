"""DynamoDBへのアクセスを提供するリポジトリ層。"""

from app.db.characters import CharacterRepository, get_character
from app.db.messages import (
    MessageRepository,
    get_recent_messages,
    save_message,
)
from app.db.processed_events import (
    ProcessedEventRepository,
    is_event_processed,
    mark_event_processed,
)

__all__ = [
    "CharacterRepository",
    "MessageRepository",
    "ProcessedEventRepository",
    "get_character",
    "get_recent_messages",
    "is_event_processed",
    "mark_event_processed",
    "save_message",
]
