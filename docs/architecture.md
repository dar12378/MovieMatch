
# MovieMatch — Project Plan

Version: 0.2

## 1. Main idea

MovieMatch is a personalized movie and TV
recommendation platform.

Users create a profile and describe their
favorite movies, shows and interests.

The system recommends relevant titles and
explains why each title was selected.

## 2. Languages

- Hebrew
- English

Hebrew uses RTL layout.
English uses LTR layout.

## 3. User profiles

Current prototype:
- Profile name
- Viewer age
- Country
- Streaming services
- Favorite movies
- Favorite genres
- Content preferences

Profile data is stored locally in the browser.

Future version:
- Secure user accounts
- Password recovery
- Multiple profiles
- Cross-device synchronization
- Parent-managed child profiles

## 4. Recommendation engine

Current:
- Age-based filtering using demo guidance
- Genre and theme matching
- Basic keyword matching
- Exclusion of selected sensitivities
- Popularity ranking
- Three recommendations per search

Future:
- Conversational AI
- Personalized recommendation embeddings
- Learning from viewing history
- User feedback
- Better semantic understanding

## 5. Movie information

Every title should eventually provide:

- Poster
- Title
- Synopsis
- Release date
- Runtime
- Seasons and episodes
- Genres
- User ratings
- Official age classification
- Violence intensity
- Horror intensity
- Romantic content
- Languages
- Streaming availability
- Recommended viewing order
- Release order
- Story chronology
- Recommendation explanation

## 6. Movie franchises

Users should be able to view:

- Release order
- Story chronology
- Essential movies
- Optional movies
- Progress through a franchise

Examples:
- Marvel Cinematic Universe
- Spider-Verse
- How to Train Your Dragon
- The Incredibles

Current implementation:
A partial curated release/story order
in the demonstration catalog.

## 7. Planned database size

100,000 movies for ages 12+
50,000 TV series for ages 12+
1,000 movies for children under 12
500 TV series for children under 12

Total target: 151,500 titles.

Current status:
12 demo titles.

The target database is not yet populated.

Data imports require lawful API or
dataset access and quality checks.

## 8. Content safety

Age guidance and content sensitivity
are separate data fields.

Age suitability must not be inferred
solely from genre.

Official age classifications must
be verified for the relevant country.

Unknown ratings must remain unknown.

## 9. Streaming availability

Future system should:
- Detect user country
- Filter by streaming subscriptions
- Distinguish subscription, rental and purchase
- Verify current availability
- Show provider links

Current status:
TMDB supports optional search and provider
information when an API token is supplied.

## 10. Commercial model

Potential revenue streams:
- Sponsored recommendations
- Streaming affiliate partnerships
- Premium subscription
- Advertising
- Business analytics, subject to privacy rules

Advertising must be clearly labeled.

The application must not claim an official
partnership without a real agreement.

## 11. Security and privacy

Before public deployment:
- Authentication
- Server security
- API rate limits
- Database protection
- Privacy policy
- Account deletion
- Consent management
- Child privacy compliance

## 12. Technology

Frontend:
HTML + CSS + JavaScript

Backend:
Python standard library HTTP server

Current catalog:
JSON file

Optional external provider:
TMDB API

## 13. Development roadmap

Phase 1:
Functional prototype.

Phase 2:
Verified content data and posters.

Phase 3:
Secure accounts and databases.

Phase 4:
Conversational AI and smarter matching.

Phase 5:
Commercial partnerships.

Phase 6:
Mobile applications and international growth.
