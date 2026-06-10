"""LLM Clientが満たす共通インターフェース。"""

from __future__ import annotations

from abc import ABC, abstractmethod


class LlmClient(ABC):
    """プロンプトからキャラクターの返信を生成する抽象クライアント。"""

    @abstractmethod
    def generate_reply(self, system_prompt: str, user_prompt: str) -> str:
        """キャラクターの返信本文だけを返す。"""

        raise NotImplementedError
