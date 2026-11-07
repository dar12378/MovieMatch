
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

# MovieMatch base server
# Compatible with upgrade_server.py

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
CATALOG_FILE = ROOT / "data" / "catalog.json"

TOKEN = os.getenv("TMDB_BEARER_TOKEN", "").strip()

LANGUAGES = {"he-IL", "en-US"}
REGIONS = {"IL", "US", "GB", "ES"}


def normalize(value):
    return re.sub(
        r"[^\w\u0590-\u05ff]+",
        "",
        str(value).lower()
    )


def load_catalog():
    with CATALOG_FILE.open(encoding="utf-8") as file:
        raw = json.load(file)

    result = []

    for index, row in enumerate(raw["titles"], 1):
        title, year, age, kind, group = row[:5]
        summary = row[5] if len(row) > 5 else ""

        aliases = []

        if "Spider-Man" in title:
            aliases.extend([
                "Spiderman",
                "Spider Man",
                "ספיידרמן",
                "Peter Parker"
            ])

        if "Iron Man" in title:
            aliases.extend([
                "Ironman",
                "איירון מן",
                "Tony Stark"
            ])

        if "Avengers" in title:
            aliases.extend([
                "Avengers",
                "הנוקמים"
            ])

        if group == "marvel":
            aliases.extend(["Marvel", "מארוול"])

        result.append({
            "source": "local",
            "id": index,
            "title": title,
            "year": year,
            "min_age": age,
            "kind": kind,
            "group": group,
            "summary": summary,
            "aliases": aliases,
            "tags": aliases,
            "themes": ["action", "teamwork"],
            "poster": None,
            "popularity": 1000 - index,
            "watch_orders": {}
        })

    return result


def fetch_tmdb(path, params=None):
    if not TOKEN:
        raise ValueError("TMDB not connected")

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
        request,
        timeout=15
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
        "title": (
            raw.get("title")
            or raw.get("name")
            or ""
        ),
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
    needle = normalize(query)
    matches = []

    for item in load_catalog():
        names = [
            item["title"],
            *item["aliases"]
        ]

        if any(
            needle in normalize(name)
            for name in names
        ):
            matches.append(item)

    return {
        "items": matches,
        "corrected": None
    }


def get_details(kind, identifier, region, language):
    if kind not in ("movie", "tv"):
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

    return {
        "providers": [
            item["provider_name"]
            for item in providers.get("flatrate", [])
        ],
        "link": providers.get("link"),
        "collection": []
    }


class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(
            *args,
            directory=str(FRONTEND),
            **kwargs
        )

    def reply(self, data, status=200):
        content = json.dumps(
            data,
            ensure_ascii=False
        ).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )
        self.send_header(
            "Content-Length",
            str(len(content))
        )
        self.send_header(
            "Cache-Control",
            "no-store"
        )
        self.end_headers()

        self.wfile.write(content)

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        def get(name, default=""):
            return params.get(name, [default])[0]

        try:
            if parsed.path == "/api/status":
                return self.reply({
                    "version": "0.4-base",
                    "catalog_count": len(load_catalog()),
                    "tmdb_enabled": bool(TOKEN)
                })

            if parsed.path == "/api/catalog":
                return self.reply({
                    "items": load_catalog()
                })

            if parsed.path == "/api/search":
                return self.reply(
                    search_titles(
                        get("q"),
                        get("language", "en-US")
                    )
                )

            if parsed.path == "/api/details":
                return self.reply(
                    get_details(
                        get("kind", "movie"),
                        get("id"),
                        get("region", "IL"),
                        get("language", "en-US")
                    )
                )

        except Exception as error:
            print("API error:", error)
            return self.reply({
                "error": "Movie service unavailable"
            }, 502)

        return super().do_GET()


def main():
    port = int(os.getenv("PORT", "8000"))

    server = ThreadingHTTPServer(
        ("127.0.0.1", port),
        Handler
    )

    print(
        f"MovieMatch running at http://localhost:{port}",
        flush=True
    )

    server.serve_forever()


if __name__ == "__main__":
    main()
