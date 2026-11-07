
import difflib
import json
import os
import re
import urllib.parse
import urllib.request

from pathlib import Path
from http.server import (
    ThreadingHTTPServer,
    SimpleHTTPRequestHandler
)

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
DATA = ROOT / "data" / "catalog.json"

TOKEN = os.getenv("TMDB_BEARER_TOKEN", "").strip()

LANGUAGES = {"he-IL", "en-US"}
REGIONS = {"IL", "US", "GB", "ES"}


def normalize(text):
    return re.sub(
        r"[^\w\u0590-\u05ff]+",
        "",
        str(text).lower()
    )


def load_catalog():
    with DATA.open(encoding="utf-8") as file:
        data = json.load(file)

    titles = []

    marvel_movies = [
        row[0]
        for row in data["titles"]
        if row[3] == "movie" and row[4] == "marvel"
    ]

    for number, row in enumerate(data["titles"], 1):
        title, year, age, kind, group = row[:5]
        summary = row[5] if len(row) > 5 else ""

        themes = ["action", "teamwork"]

        if kind == "tv":
            themes.append("fantasy")

        if "Guardians" in title or "Galaxy" in title:
            themes.append("comedy")

        if "Strange" in title or "Wanda" in title:
            themes.append("fantasy")

        if "Ant-Man" in title:
            themes.append("science")

        if "Avatar" in title or "Dragon" in title:
            themes.extend(["fantasy", "family"])

        aliases = []

        if "Spider-Man" in title:
            aliases.extend([
                "Spiderman", "Spider Man",
                "ספיידרמן", "פיטר פארקר"
            ])

        if "Iron Man" in title:
            aliases.extend(["Ironman", "איירון מן", "Tony Stark"])

        if "Thor" in title:
            aliases.extend(["תור", "Thor Odinson"])

        if "Avengers" in title:
            aliases.extend(["הנוקמים", "Avenger"])

        if "Captain America" in title:
            aliases.extend(["קפטן אמריקה", "Steve Rogers"])

        if group == "marvel":
            aliases.extend(["Marvel", "מארוול", "MCU"])

        item = {
            "source": "local",
            "id": number,
            "title": title,
            "year": year,
            "min_age": age,
            "kind": kind,
            "group": group,
            "summary": summary,
            "aliases": aliases,
            "tags": aliases,
            "themes": list(set(themes)),
            "poster": None,
            "popularity": 1000 - number,
            "watch_orders": {}
        }

        if title in marvel_movies:
            item["watch_orders"] = {
                "release": marvel_movies
            }

        titles.append(item)

    return titles


def fetch_tmdb(path, params=None):
    if not TOKEN:
        raise ValueError("TMDB is not connected")

    url = "https://api.themoviedb.org/3/" + path

    if params:
        url += "?" + urllib.parse.urlencode(params)

    request = urllib.request.Request(
        url,
        headers={
            "Authorization": "Bearer " + TOKEN,
            "Accept": "application/json"
        }
    )

    with urllib.request.urlopen(
        request, timeout=15
    ) as response:
        return json.load(response)


def convert_tmdb(raw, kind):
    poster = raw.get("poster_path")
    date = (
        raw.get("release_date")
        or raw.get("first_air_date")
        or ""
    )

    return {
        "source": "tmdb",
        "id": raw["id"],
        "title": raw.get("title") or raw.get("name") or "",
        "year": date[:4],
        "kind": kind,
        "group": "external",
        "summary": raw.get("overview", ""),
        "min_age": None,
        "themes": [],
        "aliases": [],
        "tags": [],
        "popularity": raw.get("popularity", 0),
        "poster": (
            "https://image.tmdb.org/t/p/w500" + poster
            if poster else None
        ),
        "watch_orders": {}
    }


def search_titles(query, language="en-US"):
    normalized = normalize(query)
    items = load_catalog()

    matches = []
    correction = None

    for item in items:
        terms = [
            item["title"],
            *item["aliases"]
        ]

        scores = []

        for term in terms:
            name = normalize(term)

            if not name:
                continue

            if normalized in name or name in normalized:
                scores.append(1.0)
            else:
                scores.append(
                    difflib.SequenceMatcher(
                        None, normalized, name
                    ).ratio()
                )

        best = max(scores, default=0)

        if best >= 0.68:
            matches.append((best, item))

    matches.sort(key=lambda x: -x[0])

    local_results = [
        item for _, item in matches[:70]
    ]

    if matches and matches[0][0] < 1:
        correction = matches[0][1]["title"]

    if not TOKEN:
        return {
            "items": local_results,
            "corrected": correction
        }

    if language not in LANGUAGES:
        language = "en-US"

    response = fetch_tmdb(
        "search/multi",
        {
            "query": query,
            "language": language,
            "include_adult": "false"
        }
    )

    seen = {
        (item["kind"], normalize(item["title"]))
        for item in local_results
    }

    for raw in response.get("results", []):
        kind = raw.get("media_type")

        if kind not in {"movie", "tv"}:
            continue

        item = convert_tmdb(raw, kind)
        key = (kind, normalize(item["title"]))

        if key not in seen:
            local_results.append(item)
            seen.add(key)

    return {
        "items": local_results[:90],
        "corrected": correction
    }


def get_details(kind, identifier, region, language):
    if kind not in {"movie", "tv"}:
        raise ValueError("Invalid media type")

    if not str(identifier).isdigit():
        raise ValueError("Invalid ID")

    if region not in REGIONS:
        region = "IL"

    if language not in LANGUAGES:
        language = "en-US"

    response = fetch_tmdb(
        f"{kind}/{identifier}",
        {
            "language": language,
            "append_to_response": "watch/providers"
        }
    )

    providers = response.get(
        "watch/providers", {}
    ).get("results", {}).get(region, {})

    result = {
        "providers": [
            provider["provider_name"]
            for provider in providers.get("flatrate", [])
        ],
        "link": providers.get("link"),
        "collection": []
    }

    collection = response.get("belongs_to_collection")

    if kind == "movie" and collection:
        data = fetch_tmdb(
            f"collection/{collection['id']}",
            {"language": language}
        )

        movies = sorted(
            data.get("parts", []),
            key=lambda x: x.get("release_date") or "9999"
        )

        result["collection"] = [
            movie["title"]
            for movie in movies
        ]

    return result


class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(
            *args,
            directory=str(FRONTEND),
            **kwargs
        )

    def reply(self, data, status=200):
        raw = json.dumps(
            data, ensure_ascii=False
        ).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        def param(name, default=""):
            return params.get(name, [default])[0]

        try:
            if parsed.path == "/api/status":
                return self.reply({
                    "version": "0.3",
                    "tmdb_enabled": bool(TOKEN),
                    "catalog_count": len(load_catalog())
                })

            if parsed.path == "/api/catalog":
                return self.reply({
                    "items": load_catalog()
                })

            if parsed.path == "/api/search":
                query = param("q").strip()[:120]
                language = param("language", "en-US")

                if not query:
                    return self.reply({
                        "items": [],
                        "corrected": None
                    })

                return self.reply(
                    search_titles(query, language)
                )

            if parsed.path == "/api/details":
                return self.reply(get_details(
                    param("kind", "movie"),
                    param("id"),
                    param("region", "IL"),
                    param("language", "en-US")
                ))

        except ValueError as error:
            return self.reply({
                "error": str(error)
            }, 400)

        except Exception as error:
            print("API ERROR:", error)
            return self.reply({
                "error": "Movie data service unavailable"
            }, 502)

        return super().do_GET()


def main():
    port = int(os.getenv("PORT", "8000"))

    server = ThreadingHTTPServer(
        ("127.0.0.1", port),
        Handler
    )

    print(
        f"MovieMatch v0.3 running at http://localhost:{port}",
        flush=True
    )

    server.serve_forever()


if __name__ == "__main__":
    main()
