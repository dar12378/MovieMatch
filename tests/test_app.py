
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import load_catalog, recommend, search_titles


class MovieMatchTests(unittest.TestCase):

    def test_catalog_exists(self):
        catalog = load_catalog()
        self.assertGreater(len(catalog), 0)

    def test_age_filter(self):
        items = recommend({
            "age": 10,
            "kind": "both",
            "limit": 20
        })

        self.assertTrue(items)

        for item in items:
            self.assertLessEqual(item["min_age"], 10)

    def test_horror_filter(self):
        items = recommend({
            "age": 18,
            "avoid": ["horror"],
            "limit": 20
        })

        for item in items:
            level = item["content_levels"]["horror"]
            self.assertIn(level, ["none", "mild"])
            self.assertNotIn("horror", item["themes"])

    def test_tv_only(self):
        items = recommend({
            "age": 18,
            "kind": "tv",
            "limit": 20
        })

        self.assertTrue(items)
        self.assertTrue(
            all(item["kind"] == "tv" for item in items)
        )

    def test_marvel_search(self):
        items = recommend({
            "age": 14,
            "kind": "movie",
            "taste": "Marvel superhero",
            "themes": ["action"],
            "limit": 10
        })

        self.assertTrue(items)

    def test_search_without_tmdb(self):
        from unittest.mock import patch

        with patch("app.TMDB_TOKEN", ""):
            result = search_titles("Iron Man")

        self.assertTrue(
            any(item["title"] == "Iron Man" for item in result)
        )

    def test_recommendations_limit(self):
        items = recommend({
            "age": 18,
            "limit": 3
        })

        self.assertLessEqual(len(items), 3)


if __name__ == "__main__":
    unittest.main()
