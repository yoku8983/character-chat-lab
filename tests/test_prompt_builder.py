import unittest

from app.llm.prompt_builder import build_prompts


def _character_card():
    return {
        "name": "ミナト",
        "summary": "静かな図書館の案内役",
        "speech_style": "丁寧で簡潔に話す",
        "personality": ["好奇心を大切にする", "相手を急かさない"],
        "behavior_rules": ["知らないことを断定しない", "一度に一つ質問する"],
        "example_dialogues": ["お探しの本を一緒に見つけましょう。"],
        "conversation_notes": "ユーザーの気持ちを決めつけない",
    }


class PromptBuilderTest(unittest.TestCase):
    def test_system_prompt_contains_all_character_sections(self):
        system_prompt, _ = build_prompts(
            _character_card(),
            [],
            "こんにちは",
        )

        expected_sections = [
            "【キャラクター概要】",
            "【口調】",
            "【性格・価値観】",
            "【行動ルール】",
            "【参考発話例】",
            "【会話上の注意】",
            "【出力形式】",
        ]
        for section in expected_sections:
            with self.subTest(section=section):
                self.assertIn(section, system_prompt)

        self.assertIn("名前: ミナト", system_prompt)
        self.assertIn("返信本文だけ", system_prompt)
        self.assertNotIn("JSON", system_prompt)
        self.assertNotIn("Markdown", system_prompt)

    def test_user_prompt_formats_messages_in_chronological_order(self):
        messages = [
            {
                "role": "assistant",
                "text": "二番目",
                "created_at": "2026-06-10T10:01:00+00:00",
            },
            {
                "role": "user",
                "text": "最初",
                "created_at": "2026-06-10T10:00:00+00:00",
            },
        ]

        _, user_prompt = build_prompts(
            _character_card(),
            messages,
            "続きを教えて",
        )

        self.assertLess(
            user_prompt.index("User: 最初"),
            user_prompt.index("Character: 二番目"),
        )
        self.assertIn("【ユーザーの最新発話】\n続きを教えて", user_prompt)

    def test_empty_latest_user_message_raises_clear_error(self):
        with self.assertRaisesRegex(
            ValueError,
            "latest_user_messageは空にできません",
        ):
            build_prompts(_character_card(), [], "   ")

    def test_character_card_requires_name_or_summary(self):
        with self.assertRaisesRegex(
            ValueError,
            "nameまたはsummary",
        ):
            build_prompts({"speech_style": "丁寧"}, [], "こんにちは")

    def test_invalid_character_card_raises_clear_error(self):
        with self.assertRaisesRegex(
            ValueError,
            "character_cardは辞書",
        ):
            build_prompts(None, [], "こんにちは")

    def test_same_input_produces_same_output(self):
        card = _character_card()
        messages = [{"role": "user", "text": "質問", "created_at": "1"}]

        first = build_prompts(card, messages, "回答して")
        second = build_prompts(card, messages, "回答して")

        self.assertEqual(first, second)

    def test_name_only_character_card_is_valid(self):
        system_prompt, _ = build_prompts(
            {"name": "ミナト"},
            [],
            "こんにちは",
        )

        self.assertIn("名前: ミナト", system_prompt)
        self.assertIn("概要: 未設定", system_prompt)

    def test_common_aliases_are_supported(self):
        system_prompt, _ = build_prompts(
            {
                "summary": "案内役",
                "tone": "穏やか",
                "rules": ["簡潔に答える"],
                "examples": ["こちらをご覧ください。"],
            },
            [],
            "こんにちは",
        )

        self.assertIn("穏やか", system_prompt)
        self.assertIn("- 簡潔に答える", system_prompt)
        self.assertIn("- こちらをご覧ください。", system_prompt)


if __name__ == "__main__":
    unittest.main()
