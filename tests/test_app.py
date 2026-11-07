
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import load_catalog, search_titles, normalize


class MovieMatchTests(unittest.TestCase):

    def test_catalog(self):
        titles = load_catalog()
        self.assertEqual(len(titles), 66)

    def test_marvel(self):
        titles = load_catalog()
        marvel = [x for x in titles if x["group"] == "marvel"]
        self.assertGreater(len(marvel), 50)

    def test_movies_and_shows(self):
        titles = load_catalog()
        self.assertTrue(any(x["kind"] == "movie" for x in titles))
        self.assertTrue(any(x["kind"] == "tv" for x in titles))

    def test_spiderman_alias(self):
        result = search_titles("Spiderman")
        self.assertTrue(any(
            "Spider-Man" in x["title"]
            for x in result["items"]
        ))

    def test_marvel_search(self):
        result = search_titles("Marvel")
        self.assertGreater(len(result["items"]), 20)

    def test_normalize(self):
        self.assertEqual(
            normalize("Spider-Man"),
            normalize("Spider Man")
        )

    def test_ages(self):
        titles = load_catalog()
        self.assertTrue(all(
            isinstance(x["min_age"], int)
            for x in titles
        ))


if __name__ == "__main__":
    unittest.main()
