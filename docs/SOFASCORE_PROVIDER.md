# Ratings provider architecture

Match ratings are a core requirement of this project. The module/file
names throughout this system say "SofaScore" — that's a historical label
from when SofaScore was the first (and, it turned out, inaccessible)
candidate; the **active provider is API-Football**. Treat "SofaScore" in
filenames as "the ratings provider slot", not a live claim.

## SofaScore itself — investigated, no legitimate access

Their own FAQ states plainly:

> "due to agreements with our data providers, we are unable to share the
> data sources in the form of API endpoints"
> — [sofascore.helpscoutdocs.com/article/129](https://sofascore.helpscoutdocs.com/article/129-does-sofascore-offer-sports-data-api)

Their only sanctioned integration route is a media/corporate widget
partnership (`corporate.sofascore.com/widgets`) — embeddable display
widgets, not a data feed. Separately: direct (non-widget) requests to
`api.sofascore.com` are actively blocked (`403`) from every network
tested — residential, GitHub Actions, and Anthropic's own infrastructure.
A separate library (ScraperFC) that claims to access Sofascore data was
inspected and found to depend on `cloudscraper`, `selenium`, and
`botasaurus` — anti-bot-bypass and browser-automation tooling. **This
project deliberately does not use bypass techniques of any kind** —
that's a product decision (legal/ToS exposure for the club), not a
technical limitation, and it doesn't change if asked again.

## Active provider: API-Football (api-sports.io)

A real, licensed API — not a bypass. Confirmed via official docs/support
content:

- Base URL: `https://v3.football.api-sports.io`
- Auth: `x-apisports-key: <key>` header
- `GET /players?search=|team=&season=|id=&season=` — player lookup
- `GET /fixtures?team=&last=N` — a team's most recent N fixtures
  (the API is **team-centric**, not player-centric, for match history —
  there's no confirmed "last N fixtures for this player" shortcut)
- `GET /fixtures/players?fixture=` — every player's stats for one
  fixture, including a numeric `rating` field

**Not yet confirmed against a real response** (no key exists to test
with as of writing) — verify with
`node scripts/sync-sofascore.mjs --inspect-player "Full Name"` before
trusting a full sync, the same discipline SCOUTASTIC was verified with:
the exact JSON path to `rating`, whether search reliably finds
lower-league Eastern European players (API-Football's depth is richest
for the "top five" leagues), and the real per-player request count.

Offline-tested against a mock server matching the documented shapes
(scope filtering, matching with real DOB/nationality signals, home/away/
draw result derivation, request counting) — see git history around where
this was built for the test output.

## Scope: African debutant candidates only

By explicit decision, **not** all 8,454 SCOUTASTIC players — the free
API-Football tier is 100 requests/day, which cannot cover that many
players in any reasonable time. `sync-sofascore.mjs` only ever processes
players where `isAfrican && isEasternEuropeanLeague && !isYouthOrReserve`
— directly powers the African Debutants page, `--include-all` overrides
this (not recommended on the free tier).

## Request-volume math (this scope, this tier)

Per matched player: ~1 search + 1 team-fixtures lookup + up to ~8
per-fixture lookups (to find 5 games they actually appear in) ≈ 10
requests. Per unmatched player: 1. At `--batch-size 8` (the default) and
a ~90-request-per-run hard cap (`API_FOOTBALL_MAX_REQUESTS_PER_RUN`,
enforced inside the provider — a run stops cleanly rather than exceeding
budget), one daily run processes roughly 8 never-tried candidates. A
first full pass over the debutant-candidate pool (expected: dozens to a
few hundred players, not yet counted for real) takes days to a few
weeks; after that, only stale `matched` players get refreshed
(`--refresh-after-days`, default 14), which is far lighter.

The sync workflow (`sync-sofascore.yml`) runs **once daily** — running
more often would exceed the free tier.

## The interface (why adding this provider touched almost nothing)

```js
findPlayer({ name, dateOfBirth, nationality, club })
  -> { status: "matched"|"ambiguous"|"not_found", sofascorePlayerId, confidence, reason }

getPlayerProfile(sofascorePlayerId) -> object | null
getRecentMatches(teamId, count) -> object[]
getMatchPlayerStatistics(playerId, fixtureId) -> object | null
getLastFiveRatings(sofascorePlayerId, ratingsTeamId) -> { ratings, average, highest, lowest }
isConfigured() -> boolean
```

Every consumer (the sync script; indirectly the frontend, via
`data/players.json`) depends only on this shape. Adding API-Football
meant writing one new file (`apiFootballProvider.mjs`) and one line in
`getSofaScoreProvider()`'s `if` chain — one real addition to the shape:
`getLastFiveRatings` and the stored player record both carry a
`ratingsTeamId` now, because API-Football's fixtures lookup needs a team
id, not just a player id (avoids re-searching just to refresh ratings).

### Matching — never auto-assigns an ambiguous profile

`resolveMatch()` in `sofascoreMatching.mjs` scores candidates by name
similarity (Levenshtein, accent/case-insensitive) plus bonuses for an
exact date-of-birth match, nationality match, and club overlap. Only
`matched` if the top candidate clears a confidence floor *and* beats the
runner-up by a clear margin — otherwise `ambiguous`, never a silent
guess. Verified directly against 5 scenarios (clear match, same-name tie,
DOB breaking that tie, unrelated name, no candidates) — see git history.

### SCOUTASTIC sync never touches ratings fields

`scripts/sync-scoutastic.mjs`'s upsert only merges fields SCOUTASTIC
actually owns; `sofascorePlayerId`, `sofascoreMatchStatus`,
`ratingsTeamId`, `matches`, the rating aggregates, and local scouting
state (`status`, `notes`) are explicitly preserved on every SCOUTASTIC
update. (This was a real bug caught while wiring the architecture up
originally — the first merge did a blanket object spread that would have
reset all of this on every SCOUTASTIC sync.)

## Setup (once you have a free API-Football key)

1. Sign up at [api-football.com](https://www.api-football.com/) (direct,
   not RapidAPI — the header/host differ) and grab the free-tier key.
2. Locally: `API_FOOTBALL_KEY=... SOFASCORE_PROVIDER=api-football node scripts/sync-sofascore.mjs --inspect-player "Some Real Player Name"` —
   confirms auth works and the response shape matches what the code
   expects before trusting a real batch.
3. Production: `API_FOOTBALL_KEY` as a GitHub Actions **secret**;
   `SOFASCORE_PROVIDER=api-football` as a GitHub Actions **variable**
   (not sensitive — the string name of the active provider).
