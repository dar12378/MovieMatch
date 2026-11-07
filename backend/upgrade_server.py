
import difflib
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from pathlib import Path
from threading import Lock
from http.server import ThreadingHTTPServer

import app


# =====================================
# MovieMatch v0.4
# Netflix + TMDB + AI
# =====================================

ROOT = Path(__file__).resolve().parents[1]
NETFLIX_FILE = ROOT / "data" / "netflix_top100.json"

PORT = int(os.getenv("PORT", "8000"))

OPENAI_KEY = os.getenv(
    "OPENAI_API_KEY", ""
).strip()

OPENAI_MODEL = os.getenv(
    "OPENAI_MODEL", "gpt-4.1-mini"
)

cache = {}
cache_lock = Lock()


# =====================================
# Netflix catalog
# =====================================

def netflix_catalog():
    if not NETFLIX_FILE.exists():
        print(
            "Warning: netflix_top100.json "
            "was not found"
        )
        return []

    with NETFLIX_FILE.open(
        encoding="utf-8"
    ) as file:
        source = json.load(file)

    result = []
    number = 1000

    for kind, rows in (
        ("tv", source.get("shows", [])),
        ("movie", source.get("movies", []))
    ):
        for row in rows:
            if len(row) < 3:
                continue

            title, year, age = row[:3]
            number += 1

            result.append({
                "source": "local",
                "id": number,
                "title": title,
                "year": year,
                "kind": kind,
                "group": "netflix",
                "min_age": age,
                "age_estimated": True,
                "summary": (
                    "מידע מורחב יופיע "
                    "לאחר חיבור TMDB."
                ),
                "aliases": [
                    "Netflix",
                    "נטפליקס"
                ],
                "tags": [
                    "Netflix",
                    "נטפליקס",
                    title
                ],
                "themes": [],
                "poster": None,
                "popularity": 500,
                "watch_orders": {}
            })

    return result


def full_catalog():
    return app.load_catalog() + netflix_catalog()


# =====================================
# Smart search
# =====================================

def search_catalog(query, language="en-US"):
    query = query.strip()

    if not query:
        return {
            "items": [],
            "corrected": None
        }

    needle = app.normalize(query)
    scored = []

    for item in full_catalog():
        names = [
            item["title"],
            *item.get("aliases", [])
        ]

        best = 0

        for name in names:
            value = app.normalize(name)

            if not value:
                continue

            if needle in value or value in needle:
                best = 1.0
                break

            similarity = (
                difflib.SequenceMatcher(
                    None, needle, value
                ).ratio()
            )

            best = max(best, similarity)

        if best >= 0.68:
            scored.append((best, item))

    scored.sort(
        key=lambda pair: -pair[0]
    )

    results = [
        item for _, item in scored[:120]
    ]

    correction = None

    if scored and scored[0][0] < 1:
        correction = scored[0][1]["title"]

    if app.TOKEN:
        try:
            response = app.fetch_tmdb(
                "search/multi",
                {
                    "query": query,
                    "language": (
                        language
                        if language in app.LANGUAGES
                        else "en-US"
                    ),
                    "include_adult": "false"
                }
            )

            known = {
                (
                    item["kind"],
                    app.normalize(item["title"])
                )
                for item in results
            }

            for raw in response.get(
                "results", []
            ):
                kind = raw.get(
                    "media_type"
                )

                if kind not in (
                    "movie", "tv"
                ):
                    continue

                item = app.convert_tmdb(
                    raw, kind
                )

                key = (
                    kind,
                    app.normalize(
                        item["title"]
                    )
                )

                if key not in known:
                    results.append(item)
                    known.add(key)

        except Exception as error:
            print(
                "TMDB search error:",
                error
            )

    return {
        "items": results[:120],
        "corrected": correction
    }


# =====================================
# Posters and movie information
# =====================================

def tmdb_information(
    title,
    kind="movie",
    year=None
):
    if not app.TOKEN:
        return {
            "connected": False,
            "poster": None
        }

    if kind not in ("movie", "tv"):
        kind = "movie"

    key = (
        title.lower(),
        kind,
        str(year or "")
    )

    with cache_lock:
        if key in cache:
            return cache[key]

    response = app.fetch_tmdb(
        f"search/{kind}",
        {
            "query": title,
            "language": "en-US",
            "include_adult": "false"
        }
    )

    candidates = response.get(
        "results", []
    )

    if not candidates:
        return {
            "connected": True,
            "poster": None
        }

    def similarity(item):
        candidate = (
            item.get("title")
            or item.get("name")
            or ""
        )

        score = (
            difflib.SequenceMatcher(
                None,
                title.casefold(),
                candidate.casefold()
            ).ratio()
        )

        date = (
            item.get("release_date")
            or item.get("first_air_date")
            or ""
        )

        if (
            year and
            date[:4] == str(year)
        ):
            score += 0.2

        return score

    best = max(
        candidates,
        key=similarity
    )

    if similarity(best) < 0.75:
        return {
            "connected": True,
            "poster": None
        }

    identifier = best["id"]

    details = app.fetch_tmdb(
        f"{kind}/{identifier}",
        {
            "language": "he-IL"
        }
    )

    poster_path = (
        details.get("poster_path")
        or best.get("poster_path")
    )

    poster = None

    if poster_path:
        poster = (
            "https://image.tmdb.org/"
            "t/p/w500"
            + poster_path
        )

    overview = details.get(
        "overview", ""
    )

    if not overview:
        english = app.fetch_tmdb(
            f"{kind}/{identifier}",
            {
                "language": "en-US"
            }
        )

        overview = english.get(
            "overview", ""
        )

    result = {
        "connected": True,
        "poster": poster,
        "overview": overview,
        "genres": [
            value["name"]
            for value in details.get(
                "genres", []
            )
        ],
        "rating": details.get(
            "vote_average", 0
        ),
        "votes": details.get(
            "vote_count", 0
        ),
        "runtime": details.get(
            "runtime"
        ),
        "seasons": details.get(
            "number_of_seasons"
        ),
        "episodes": details.get(
            "number_of_episodes"
        ),
        "tmdb_url": (
            f"https://www.themoviedb.org/"
            f"{kind}/{identifier}"
        )
    }

    with cache_lock:
        cache[key] = result

    return result


# =====================================
# MovieMatch AI
# =====================================

def chat_with_ai(
    message,
    age,
    language="he",
    watched=None
):
    if not OPENAI_KEY:
        return {
            "enabled": False,
            "answer": (
                "MovieMatch AI עדיין "
                "לא מחובר. צריך להגדיר "
                "OPENAI_API_KEY במחשב."
            )
        }

    age = max(
        1,
        min(100, int(age))
    )

    if watched is None:
        watched = []

    titles = [
        item["title"]
        for item in full_catalog()
    ]

    instructions = (
        "You are MovieMatch, "
        "a movie and TV recommendation "
        "assistant. "
        "Answer in Hebrew when the "
        "user writes in Hebrew, and "
        "in English otherwise. "
        f"The viewer age is {age}. "
        "Recommend age-appropriate "
        "movies and series. "
        "Avoid mature recommendations "
        "for children. "
        "The app's sample age labels "
        "are not official ratings. "
        "Never invent movies, "
        "age classifications or "
        "streaming availability. "
        "Explain why each recommendation "
        "is suitable. "
        "Prefer catalog titles when "
        "relevant: "
        + ", ".join(titles[:180])
        + ". Already watched: "
        + ", ".join(watched[:30])
    )

    payload = {
        "model": OPENAI_MODEL,
        "instructions": instructions,
        "input": message[:1200],
        "max_output_tokens": 850,
        "store": False
    }

    request = urllib.request.Request(
        "https://api.openai.com/"
        "v1/responses",
        data=json.dumps(
            payload
        ).encode("utf-8"),
        headers={
            "Authorization":
                "Bearer " + OPENAI_KEY,
            "Content-Type":
                "application/json"
        },
        method="POST"
    )

    with urllib.request.urlopen(
        request,
        timeout=60
    ) as response:
        data = json.load(response)

    answers = []

    for output in data.get(
        "output", []
    ):
        for part in output.get(
            "content", []
        ):
            if (
                part.get("type")
                == "output_text"
            ):
                answers.append(
                    part.get("text", "")
                )

    return {
        "enabled": True,
        "answer": (
            "\n".join(answers).strip()
            or "לא התקבלה תשובה."
        )
    }


# =====================================
# HTTP Server
# =====================================

class Handler(app.Handler):

    def do_GET(self):
        parsed = (
            urllib.parse.urlsplit(
                self.path
            )
        )

        params = (
            urllib.parse.parse_qs(
                parsed.query
            )
        )

        def get(
            name,
            default=""
        ):
            return params.get(
                name,
                [default]
            )[0]

        if parsed.path == "/api/status":
            return self.reply({
                "version": "0.4",
                "catalog_count":
                    len(full_catalog()),
                "netflix_count":
                    len(netflix_catalog()),
                "tmdb_enabled":
                    bool(app.TOKEN),
                "ai_enabled":
                    bool(OPENAI_KEY)
            })

        if parsed.path == "/api/catalog":
            return self.reply({
                "items": full_catalog()
            })

        if parsed.path == "/api/netflix":
            return self.reply({
                "items": netflix_catalog(),
                "official_ranking": False
            })

        if parsed.path == "/api/search":
            return self.reply(
                search_catalog(
                    get("q")[:120],
                    get(
                        "language",
                        "en-US"
                    )
                )
            )

        if parsed.path == "/api/enrich":
            try:
                return self.reply(
                    tmdb_information(
                        get("title")[:120],
                        get(
                            "kind",
                            "movie"
                        ),
                        get("year")[:4]
                    )
                )

            except Exception as error:
                print(
                    "TMDB metadata error:",
                    error
                )

                return self.reply({
                    "poster": None,
                    "error":
                        "TMDB unavailable"
                })

        return super().do_GET()

    def do_POST(self):
        parsed = (
            urllib.parse.urlsplit(
                self.path
            )
        )

        if parsed.path != "/api/ai":
            return self.reply({
                "error": "Not found"
            }, 404)

        try:
            length = int(
                self.headers.get(
                    "Content-Length",
                    "0"
                )
            )

            if (
                length < 1
                or length > 10000
            ):
                return self.reply({
                    "error":
                        "Invalid request size"
                }, 400)

            data = json.loads(
                self.rfile.read(
                    length
                ).decode("utf-8")
            )

            message = str(
                data.get(
                    "message", ""
                )
            ).strip()[:1200]

            if not message:
                return self.reply({
                    "error":
                        "Empty message"
                }, 400)

            watched = data.get(
                "watched", []
            )

            if not isinstance(
                watched, list
            ):
                watched = []

            watched = [
                str(value)[:100]
                for value in watched[:30]
            ]

            result = chat_with_ai(
                message,
                data.get(
                    "age", 18
                ),
                data.get(
                    "language", "he"
                ),
                watched
            )

            return self.reply(
                result
            )

        except (
            urllib.error.HTTPError
        ) as error:
            return self.reply({
                "error": (
                    "שירות ה־AI החזיר "
                    f"שגיאה {error.code}. "
                    "בדוק את מפתח ה־API."
                )
            }, 502)

        except Exception as error:
            print(
                "AI server error:",
                error
            )

            return self.reply({
                "error":
                    "AI service unavailable"
            }, 502)


# =====================================
# Start
# =====================================

def main():
    server = ThreadingHTTPServer(
        ("127.0.0.1", PORT),
        Handler
    )

    print(
        "MovieMatch v0.4 running at "
        f"http://localhost:{PORT}",
        flush=True
    )

    print(
        "Netflix titles:",
        len(netflix_catalog())
    )

    print(
        "TMDB connected:",
        bool(app.TOKEN)
    )

    print(
        "AI connected:",
        bool(OPENAI_KEY)
    )

    server.serve_forever()


if __name__ == "__main__":
    main()
