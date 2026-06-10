import unittest
from unittest.mock import Mock

from app.db.characters import CharacterRepository


class CharacterRepositoryTest(unittest.TestCase):
    def test_get_character_returns_item(self):
        table = Mock()
        table.get_item.return_value = {
            "Item": {
                "character_id": "default",
                "name": "案内役",
            }
        }
        repository = CharacterRepository(table)

        result = repository.get_character("default")

        self.assertEqual(
            result,
            {"character_id": "default", "name": "案内役"},
        )
        table.get_item.assert_called_once_with(
            Key={"character_id": "default"}
        )

    def test_get_character_returns_none_when_item_does_not_exist(self):
        table = Mock()
        table.get_item.return_value = {}
        repository = CharacterRepository(table)

        self.assertIsNone(repository.get_character("missing"))


if __name__ == "__main__":
    unittest.main()
