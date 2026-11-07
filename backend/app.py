
import difflib
import json
import os
import re
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[1]
TOKEN = os.getenv('TMDB_BEARER_TOKEN', '').strip()
AI_KEY = os.getenv('OPENAI_API_KEY', '').strip()
AI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4.1-mini')
CACHE = {}
LOCK = Lock()

# Built-in Marvel and Disney collections
MARVEL_MOVIES = '''Iron Man|2008;The Incredible Hulk|2008;Iron Man 2|2010;Thor|2011;Captain America: The First Avenger|2011;The Avengers|2012;Iron Man 3|2013;Thor: The Dark World|2013;Captain America: The Winter Soldier|2014;Guardians of the Galaxy|2014;Avengers: Age of Ultron|2015;Ant-Man|2015;Captain America: Civil War|2016;Doctor Strange|2016;Guardians of the Galaxy Vol. 2|2017;Spider-Man: Homecoming|2017;Thor: Ragnarok|2017;Black Panther|2018;Avengers: Infinity War|2018;Ant-Man and the Wasp|2018;Captain Marvel|2019;Avengers: Endgame|2019;Spider-Man: Far From Home|2019;Black Widow|2021;Shang-Chi and the Legend of the Ten Rings|2021;Eternals|2021;Spider-Man: No Way Home|2021;Doctor Strange in the Multiverse of Madness|2022;Thor: Love and Thunder|2022;Black Panther: Wakanda Forever|2022;Ant-Man and the Wasp: Quantumania|2023;Guardians of the Galaxy Vol. 3|2023;The Marvels|2023;Deadpool & Wolverine|2024;Captain America: Brave New World|2025;Thunderbolts*|2025;The Fantastic Four: First Steps|2025'''

MARVEL_SHOWS = '''WandaVision|2021;The Falcon and the Winter Soldier|2021;Loki|2021;What If...?|2021;Hawkeye|2021;Moon Knight|2022;Ms. Marvel|2022;She-Hulk: Attorney at Law|2022;Secret Invasion|2023;Echo|2024;Agatha All Along|2024;Daredevil: Born Again|2025;Ironheart|2025;Your Friendly Neighborhood Spider-Man|2025;Eyes of Wakanda|2025;Marvel Zombies|2025;X-Men '97|2024'''

DISNEY_OTHER = '''The Mandalorian|2019|tv;Andor|2022|tv;Ahsoka|2023|tv;Obi-Wan Kenobi|2022|tv;The Book of Boba Fett|2021|tv;Star Wars: The Clone Wars|2008|tv;Star Wars Rebels|2014|tv;Percy Jackson and the Olympians|2023|tv;Gravity Falls|2012|tv;Phineas and Ferb|2007|tv;The Simpsons|1989|tv;Bluey|2018|tv;Frozen|2013|movie;Frozen II|2019|movie;Moana|2016|movie;Encanto|2021|movie;Zootopia|2016|movie;Inside Out|2015|movie;Inside Out 2|2024|movie;Coco|2017|movie;Toy Story|1995|movie;The Incredibles|2004|movie;Ratatouille|2007|movie;Luca|2021|movie;Turning Red|2022|movie;Elemental|2023|movie;The Lion King|1994|movie;Aladdin|1992|movie;The Little Mermaid|1989|movie;Tangled|2010|movie;Big Hero 6|2014|movie'''


def norm(value):
    return re.sub(r'[^\w\u0590-\u05ff]', '', str(value).casefold())


def title_item(title, year, kind, group, age=None, summary=''):
    return {
        'source': 'local',
        'id': norm(title) + ':' + str(year) + ':' + kind,
        'title': title,
        'year': year,
        'kind': kind,
        'group': group,
        'min_age': age,
        'summary': summary,
        'poster': None,
        'aliases': [],
        'themes': [],
        'popularity': 1
    }


def rows_to_items(rows, kind, group):
    items = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 2:
            continue
        age = row[2] if len(row) > 2 and isinstance(row[2], int) else None
        items.append(title_item(str(row[0]), row[1], kind, group, age))
    return items


def catalog():
    items = []

    for raw, kind in ((MARVEL_MOVIES, 'movie'), (MARVEL_SHOWS, 'tv')):
        for entry in raw.split(';'):
            title, year = entry.rsplit('|', 1)
            age = 18 if any(k in title for k in (
                'Deadpool', 'Marvel Zombies', 'Daredevil', 'Echo'
            )) else 13
            items.append(title_item(title, int(year), kind, 'marvel', age))

    for entry in DISNEY_OTHER.split(';'):
        title, year, kind = entry.split('|')
        age = 3 if title == 'Bluey' else 8
        items.append(title_item(title, int(year), kind, 'disney', age))

    # Supports both Netflix JSON format and older MovieMatch format
    for path in (
        ROOT / 'data/netflix_top100.json',
        ROOT / 'data/catalog.json'
    ):
        if not path.exists():
            continue

        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError) as exc:
            print('Catalog read error:', path.name, exc)
            continue

        if isinstance(data.get('shows'), list):
            items.extend(rows_to_items(data['shows'], 'tv', 'netflix'))

        if isinstance(data.get('movies'), list):
            items.extend(rows_to_items(data['movies'], 'movie', 'netflix'))

        for row in data.get('titles', []):
            if not isinstance(row, list) or len(row) < 5:
                continue

            title, year, age, kind, group = row[:5]
            if kind not in ('movie', 'tv'):
                continue

            items.append(title_item(
                title, year, kind, group,
                age if isinstance(age, int) else None,
                row[5] if len(row) > 5 else ''
            ))

    dedup = {}

    for item in items:
        k = (norm(item['title']), str(item['year']), item['kind'])

        if k not in dedup:
            dedup[k] = item
        elif item['group'] == 'marvel':
            dedup[k]['group'] = 'marvel'

        if item['group'] == 'netflix' and k in dedup:
            dedup[k].setdefault('services', []).append('netflix')

    for item in dedup.values():
        if item['group'] in ('marvel', 'disney'):
            item.setdefault('services', []).append('disney')
        if item['group'] == 'netflix':
            item.setdefault('services', []).append('netflix')

    return list(dedup.values())


def tmdb(path, params=None):
    if not TOKEN:
        raise RuntimeError('TMDB not configured')

    url = 'https://api.themoviedb.org/3/' + path

    if params:
        url += '?' + urllib.parse.urlencode(params)

    request = urllib.request.Request(url, headers={
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/json'
    })

    with urllib.request.urlopen(request, timeout=18) as response:
        return json.load(response)


def metadata(title, kind, year):
    if not TOKEN:
        return {'configured': False}

    key = (norm(title), kind, str(year))

    with LOCK:
        if key in CACHE:
            return CACHE[key]

    found = tmdb('search/' + kind, {
        'query': title,
        'language': 'en-US',
        'include_adult': 'false'
    })

    candidates = found.get('results', [])

    def match(candidate):
        name = candidate.get('title') or candidate.get('name') or ''
        date = (
            candidate.get('release_date')
            or candidate.get('first_air_date')
            or ''
        )
        value = difflib.SequenceMatcher(
            None, norm(title), norm(name)
        ).ratio()
        return value + (0.18 if date.startswith(str(year)) else 0)

    if not candidates:
        return {'configured': True}

    best = max(candidates, key=match)

    if match(best) < 0.73:
        return {'configured': True}

    details = tmdb(kind + '/' + str(best['id']), {
        'language': 'he-IL'
    })

    poster = details.get('poster_path') or best.get('poster_path')

    result = {
        'configured': True,
        'poster': (
            'https://image.tmdb.org/t/p/w500' + poster
            if poster else None
        ),
        'summary': details.get('overview') or best.get('overview') or '',
        'rating': details.get('vote_average'),
        'genres': [x['name'] for x in details.get('genres', [])],
        'runtime': details.get('runtime'),
        'seasons': details.get('number_of_seasons'),
        'link': f'https://www.themoviedb.org/{kind}/{best["id"]}'
    }

    with LOCK:
        CACHE[key] = result

    return result


def ai_answer(question, age, watched):
    if not AI_KEY:
        return {
            'enabled': False,
            'answer': (
                'ה־AI עדיין לא מחובר. אפשר להשתמש בקטלוג ובחיפוש, '
                'ולחבר מפתח OpenAI בהמשך.'
            )
        }

    safe_age = min(100, max(1, int(age)))
    known = ', '.join(x['title'] for x in catalog()[:180])

    instructions = (
        'You are MovieMatch, a friendly Hebrew/English movie '
        'recommendation assistant. Answer in the language of the '
        'question. Recommend known real titles, not inventions. '
        'Do not assert Netflix/Disney+ availability or official '
        'age ratings without evidence. Age ratings in this app '
        'are unverified; be cautious for minors. '
        f'The user age is {safe_age}. '
        f'Watched titles: {", ".join(watched[:25])}. '
        f'Selection of available catalog titles: {known}. '
        'Offer 3-5 recommendations with short reasons. No spoilers.'
    )

    payload = json.dumps({
        'model': AI_MODEL,
        'instructions': instructions,
        'input': question[:1200],
        'max_output_tokens': 600,
        'store': False
    }).encode('utf-8')

    request = urllib.request.Request(
        'https://api.openai.com/v1/responses',
        data=payload,
        method='POST',
        headers={
            'Authorization': 'Bearer ' + AI_KEY,
            'Content-Type': 'application/json'
        }
    )

    with urllib.request.urlopen(request, timeout=45) as response:
        data = json.load(response)

    answer = '\n'.join(
        piece.get('text', '')
        for result in data.get('output', [])
        for piece in result.get('content', [])
        if piece.get('type') == 'output_text'
    ).strip()

    return {
        'enabled': True,
        'answer': answer or 'לא התקבלה תשובה. נסה שוב.'
    }


class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(
            *args,
            directory=str(ROOT / 'frontend'),
            **kwargs
        )

    def send_json(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header(
            'Content-Type',
            'application/json; charset=utf-8'
        )
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(parsed.query)

        def val(k, default=''):
            return q.get(k, [default])[0]

        try:
            if parsed.path == '/api/status':
                items = catalog()
                return self.send_json({
                    'version': '0.5',
                    'total': len(items),
                    'netflix': sum(
                        'netflix' in x.get('services', []) for x in items
                    ),
                    'disney': sum(
                        'disney' in x.get('services', []) for x in items
                    ),
                    'tmdb': bool(TOKEN),
                    'ai': bool(AI_KEY)
                })

            if parsed.path == '/api/catalog':
                return self.send_json({'items': catalog()})

            if parsed.path == '/api/enrich':
                kind = val('kind', 'movie')
                if kind not in ('tv', 'movie'):
                    return self.send_json({'error': 'Invalid type'}, 400)

                return self.send_json(metadata(
                    val('title')[:120],
                    kind,
                    val('year')[:4]
                ))

            if parsed.path == '/api/search':
                term = norm(val('q')[:120])
                items = catalog()

                if term:
                    def score(item):
                        name = norm(item['title'])
                        aliases = (
                            ['spiderman', 'ספיידרמן', 'פיטרפארקר']
                            if 'Spider-Man' in item['title'] else []
                        )
                        if term in name or any(term in a for a in aliases):
                            return 2
                        return difflib.SequenceMatcher(
                            None, term, name
                        ).ratio()

                    items = [
                        x for x in items if score(x) >= .63
                    ]
                    items.sort(key=score, reverse=True)

                return self.send_json({'items': items[:250]})

        except Exception as exc:
            print('API error:', exc)
            return self.send_json({
                'error': 'Service temporarily unavailable'
            }, 502)

        return super().do_GET()

    def do_POST(self):
        if urllib.parse.urlsplit(self.path).path != '/api/ai':
            return self.send_json({'error': 'Not found'}, 404)

        try:
            length = int(self.headers.get('Content-Length', '0'))

            if not 0 < length <= 6000:
                return self.send_json({
                    'error': 'Invalid request length'
                }, 400)

            data = json.loads(
                self.rfile.read(length).decode('utf-8')
            )

            question = str(data.get('message', '')).strip()[:1200]
            if not question:
                return self.send_json({
                    'error': 'Message is empty'
                }, 400)

            watched = data.get('watched', [])
            if not isinstance(watched, list):
                watched = []

            watched = [str(x)[:90] for x in watched[:25]]

            return self.send_json(ai_answer(
                question,
                data.get('age', 18),
                watched
            ))

        except Exception as exc:
            print('AI error:', type(exc).__name__, str(exc)[:120])
            return self.send_json({
                'error': 'AI service unavailable; check key and billing'
            }, 502)


def main():
    port = int(os.getenv('PORT', '8000'))
    print(
        'MovieMatch v0.5 at http://localhost:' + str(port),
        flush=True
    )
    print('OpenAI:', 'connected' if AI_KEY else 'not connected')
    print('TMDB:', 'connected' if TOKEN else 'not connected')

    ThreadingHTTPServer(
        ('127.0.0.1', port),
        Handler
    ).serve_forever()


if __name__ == '__main__':
    main()
