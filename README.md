
# MovieMatch

A personalized movie and TV discovery application.

Version 0.2

## Features

- Hebrew and English
- Personal preferences
- Movie and TV recommendations
- Age filtering using demo data
- Content sensitivities
- Movie franchise viewing order
- Watchlist
- Watched titles
- Movie search
- Optional TMDB integration

## Project structure

frontend/
  index.html
  css/style.css
  js/i18n.js
  js/main.js

backend/
  app.py

data/
  catalog.json

tests/
  test_app.py

docs/
  architecture.md

## Requirements

Python 3.10 or newer.

No external Python packages are required.

## Installation

1. Download this repository.
2. Extract the ZIP file.
3. Open a terminal in the MovieMatch folder.
4. Run:

python backend/app.py

5. Open your browser at:

http://localhost:8000

## Run tests

python -m unittest discover -s tests -v

## Optional TMDB setup

A TMDB API token enables searching a much
larger movie and TV database.

Windows PowerShell:

$env:TMDB_BEARER_TOKEN="YOUR_TOKEN"
python backend/app.py

macOS / Linux:

export TMDB_BEARER_TOKEN="YOUR_TOKEN"
python backend/app.py

Never publish your real API token on GitHub.

## Important limitations

This is a working prototype, not a
production-ready commercial product.

- Catalog currently contains 12 demo titles.
- The 151,500-title database is not populated.
- No conversational AI is connected yet.
- Age guidance is illustrative, not official.
- Streaming availability is not guaranteed.
- Demo recommendations do not verify providers.
- Profiles are stored in browser localStorage.
- No cloud login or user accounts yet.
- No commercial advertising is active.

## Attribution

This product uses the TMDB API but is not
endorsed or certified by TMDB.

TMDB content and images are subject to the
relevant licensing and attribution terms.

## Next steps

- Expand the database
- Add official age ratings
- Add verified provider information
- Integrate conversational AI
- Add secure user accounts
- Build a mobile application
