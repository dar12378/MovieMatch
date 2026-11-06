
import json
import math
import os
import re
import urllib.parse
import urllib.request

from http.server import (
    ThreadingHTTPServer,
    SimpleHTTPRequestHandler
)
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
CATALOG = ROOT / "data" / "catalog.json"

TMDB_TOKEN = os.getenv("TMDB_BEARER_TOKEN", "").strip()

ALLOWED_REGIONS = {"IL", "US", "GB", "ES"}
ALLOWED_LANGUAGES = {"he-IL", "en-US"}


def load_catalog():
    with open(CATALOG, encoding="utf-8") as file:
        data = json.load(file)
    return data["titles"]


def safe_int(value, default, minimum, maximum):
    try:
        number = int(value)
        return max(minimum, min(number, maximum))
    except (TypeError, ValueError):
        return default


def words(text):
    return set(
        re.findall(r"[^\W_]+", str(text).lower(), flags=re.UNICODE)
    )


def recommend(profile, catalog=None):
    if catalog is None:
        catalog = load_catalog()

    age = safe_int(profile.get("age"), 12, 1, 100)
    kind = profile.get("kind", "both")

    if kind not in {"both", "movie", "tv"}:
        kind = "both"

    themes = set(profile.get("themes") or [])
    avoid = set(profile.get("avoid") or [])
    taste = words(profile.get("taste", ""))

    results = []

    for original in catalog:
        item = dict(original)

        if kind != "both" and item["kind"] != kind:
            continue

        # Titles without age guidance are not eligible
        # for children's recommendations.
        min_age = item.get("min_age")

        if min_age is None or min_age > age:
            continue

        # Do not recommend titles with explicitly excluded
        # content sensitivities.
        levels = item.get("content_levels", {})

        if any(
            levels.get(topic, "unknown") not in {"none", "mild"}
            for topic in avoid
        ):
            continue

        # A user asking to avoid a category should not
        # receive a title strongly associated with it.
        if any(
            theme in item.get("themes", [])
            for theme in avoid
        ):
            continue

        text = " ".join([
            item.get("title", ""),
            item.get("summary", ""),
            " ".join(item.get("keywords", [])),
            " ".join(item.get("themes", []))
        ])

        tokens = words(text)

        overlap = len(tokens.intersection(taste))
        theme_matches = len(
            themes.intersection(set(item.get("themes", [])))
        )

        score = (
            item.get("rating", 0) * 3 +
            theme_matches * 14 +
            overlap * 12 +
            math.log1p(item.get("popularity", 0))
        )

        item["match_score"] = round(score, 2)
        item["source"] = "demo"

        item["why"] = [
            theme for theme in item.get("themes", [])
            if theme in themes
        ]

        if overlap and not item["why"]:
            item["why"] = ["Matches your favorite titles"]

        if not item["why"]:
            item["why"] = ["Popular title from the catalog"]

        results.append(item)

    results.sort(
        key=lambda item: item["match_score"],
        reverse=True
    )

    limit = safe_int(profile.get("limit"), 3, 1, 20)
    return results[:limit]


def tmdb_fetch(path, params=None):
    if not TMDB_TOKEN:
        raise ValueError(
            "TMDB is not connected. Configure TMDB_BEARER_TOKEN."
        )

    url = "https://api.themoviedb.org/3/" + path.lstrip("/")

    if params:
        url += "?" + urllib.parse.urlencode(params)

    request = urllib.request.Request(
        url,
        headers={
            "Authorization": "Bearer " + TMDB_TOKEN,
            "Accept": "application/json"
        }
    )

    with urllib.request.urlopen(
        request, timeout=15
    ) as response:
        return json.load(response)


def search_titles(query, language="en-US"):
    if language not in ALLOWED_LANGUAGES:
        language = "en-US"

    if not TMDB_TOKEN:
        catalog = load_catalog()
        return [
            {
                **item,
                "source": "demo"
            }
            for item in catalog
            if query.lower() in item["title"].lower()
        ][:20]

    response = tmdb_fetch("search/multi", {
        "query": query,
        "language": language,
        "include_adult": "false"
    })

    items = []

    for result in response.get("results", []):
        kind = result.get("media_type")

        if kind not in {"movie", "tv"}:
            continue

        if result.get("adult"):
            continue

        date = (
            result.get("release_date") or
            result.get("first_air_date") or ""
        )

        poster = result.get("poster_path")

        items.append({
            "id": result["id"],
            "kind": kind,
            "title": result.get("title") or result.get("name"),
            "year": date[:4],
            "summary": result.get("overview", ""),
            "rating": result.get("vote_average", 0),
            "poster": (
                "https://image.tmdb.org/t/p/w342" + poster
                if poster else None
            ),
            "min_age": None,
            "themes": [],
            "source": "tmdb"
        })

    return items[:20]


def movie_details(kind, identifier, region, language):
    if kind not in {"movie", "tv"}:
        raise ValueError("Invalid media type")

    if not str(identifier).isdigit():
        raise ValueError("Invalid title identifier")

    if region not in ALLOWED_REGIONS:
        region = "IL"

    if language not in ALLOWED_LANGUAGES:
        language = "en-US"

    response = tmdb_fetch(
        f"{kind}/{identifier}",
        {
            "language": language,
            "append_to_response": "watch/providers"
        }
    )

    providers = response.get(
        "watch/providers", {}
    ).get("results", {}).get(region, {})

    details = {
        "id": response["id"],
        "kind": kind,
        "title": (
            response.get("title") or
            response.get("name")
        ),
        "summary": response.get("overview", ""),
        "rating": response.get("vote_average", 0),
        "min_age": None,
        "source": "tmdb",
        "flatrate": [
            p["provider_name"]
            for p in providers.get("flatrate", [])
        ],
        "rent": [
            p["provider_name"]
            for p in providers.get("rent", [])
        ],
        "buy": [
            p["provider_name"]
            for p in providers.get("buy", [])
        ],
        "watch_link": providers.get("link"),
        "collection": [],
        "seasons": []
    }

    if kind == "movie":
        collection = response.get("belongs_to_collection")

        if collection:
            info = tmdb_fetch(
                "collection/" + str(collection["id"]),
                {"language": language}
            )

            movies = sorted(
                info.get("parts", []),
                key=lambda x: x.get("release_date", "")
            )

            details["collection"] = [
                {
                    "title": movie["title"],
                    "year": (
                        movie.get("release_date") or ""
                    )[:4]
                }
                for movie in movies
            ]

    if kind == "tv":
        details["seasons"] = [
            {
                "number": season["season_number"],
                "name": season["name"],
                "episodes": season.get("episode_count")
            }
            for season in response.get("seasons", [])
            if season.get("season_number", 0) > 0
        ]

    return details


class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(
            *args,
            directory=str(FRONTEND),
            **kwargs
        )

    def json_response(self, data, status=200):
        body = json.dumps(
            data, ensure_ascii=False
        ).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        try:
            if parsed.path == "/api/status":
                return self.json_response({
                    "ok": True,
                    "tmdb_enabled": bool(TMDB_TOKEN),
                    "catalog_count": len(load_catalog()),
                    "languages": ["en", "he"]
                })

            if parsed.path == "/api/catalog":
                return self.json_response({
                    "items": load_catalog()
                })

            if parsed.path == "/api/search":
                term = query.get("q", [""])[0].strip()

                if len(term) < 2:
                    return self.json_response({"items": []})

                if len(term) > 120:
                    raise ValueError("Search query too long")

                language = query.get(
                    "language", ["en-US"]
                )[0]

                return self.json_response({
                    "items": search_titles(term, language)
                })

            if parsed.path == "/api/details":
                kind = query.get("kind", ["movie"])[0]
                identifier = query.get("id", [""])[0]
                region = query.get("region", ["IL"])[0]
                language = query.get(
                    "language", ["en-US"]
                )[0]

                return self.json_response(
                    movie_details(
                        kind, identifier, region, language
                    )
                )

        except (ValueError, FileNotFoundError) as error:
            return self.json_response({
                "error": str(error)
            }, 400)

        except Exception:
            return self.json_response({
                "error": "External service or server error"
            }, 502)

        return super().do_GET()

    def do_POST(self):
        try:
            if self.path != "/api/recommend":
                return self.json_response({
                    "error": "Not found"
                }, 404)

            length = int(
                self.headers.get("Content-Length", "0")
            )

            if length < 0 or length > 65536:
                raise ValueError("Invalid request size")

            data = json.loads(
                self.rfile.read(length).decode("utf-8")
            )

            if not isinstance(data, dict):
                raise ValueError("Expected an object")

            return self.json_response({
                "items": recommend(data),
                "source": "demo_catalog",
                "availability_verified": False
            })

        except (ValueError, json.JSONDecodeError) as error:
            return self.json_response({
                "error": str(error)
            }, 400)


def start():
    port = int(os.getenv("PORT", "8000"))

    server = ThreadingHTTPServer(
        ("127.0.0.1", port),
        Handler
    )

    print(f"MovieMatch is running at http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    start()
