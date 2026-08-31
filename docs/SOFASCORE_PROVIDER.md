# Ratings provider architecture

Match ratings are a core requirement of this project. The module/file
names throughout this system say "SofaScore" — that's a historical label
from the first candidate investigated; treat it as "the ratings provider
slot," not a live claim about which vendor is active.

**Current state (2026-08-31): no real provider is connected.** Every
player genuinely shows "SofaScore data unavailable" — not an
approximation, not a substitute source. `getSofaScoreProvider()`
(`scripts/lib/sofascoreProvider.mjs`) always returns the null provider;
there is no other option implemented today.

## What's been investigated and ruled out, and why

**SofaScore itself.** Their own FAQ states plainly:

> "due to agreements with our data providers, we are unable to share the
> data sources in the form of API endpoints"
> — [sofascore.helpscoutdocs.com/article/129](https://sofascore.helpscoutdocs.com/article/129-does-sofascore-offer-sports-data-api)

Their only sanctioned integration route is a media/corporate widget
partnership (`corporate.sofascore.com/widgets`) — embeddable display
widgets, not a data feed. Direct (non-widget) requests to
`api.sofascore.com` are actively blocked (`403`) from every network
tested — residential, GitHub Actions, and Anthropic's own infrastructure,
confirmed directly. A library claiming to access SofaScore data
(ScraperFC) was inspected and found to depend on `cloudscraper`,
`selenium`, and `botasaurus` — anti-bot-bypass and browser-automation
tooling.

**FotMob**, investigated as an alternative (2026-08-31). The
straightforward wrapper library (plain `requests`, no special headers)
turned out to hit dead endpoints — FotMob has since moved its real API.
The actively-maintained wrapper explicitly advertises "automatic proxy
token handling and caching" as a feature, meaning the *current* real
FotMob API needs a rotating signed auth token plus proxy infrastructure —
the same class of anti-bot bypass already ruled out for SofaScore, not an
easier path.

**API-Football** (api-sports.io) was implemented as a real, licensed
alternative (not a bypass) — base URL, auth header, and endpoint shapes
were confirmed via official docs, offline-tested against a mock server,
and scoped to African debutant candidates only (the free tier's 100
requests/day couldn't cover the full player set). It was **never
connected to a real key** — nothing was verified against a live
response. It was subsequently **removed per explicit instruction**: real
SofaScore ratings only, no substitute provider, "SofaScore data
unavailable" when nothing real is available. Nothing regresses by having
removed it, since it was never live.

**This project deliberately does not use bypass techniques of any
kind** — proxies, rotating tokens, browser automation, fingerprint
spoofing, cookie tricks. That's a product decision (legal/ToS exposure
for the club), not a technical limitation, and doesn't change if a
different provider is suggested — the same evaluation applies to any of
them.

## What's still real and ready

`sofascoreProvider.mjs`'s interface is unchanged and provider-agnostic —
adding a real implementation later (a licensed data feed, a legitimate
SofaScore partnership, anything with a genuine `rating` field and a
sanctioned way to reach it) only means writing one new file and one
branch in `getSofaScoreProvider()`, never touching any caller:

```js
findPlayer({ name, dateOfBirth, nationality, club })
  -> { status: "matched"|"ambiguous"|"not_found", sofascorePlayerId, confidence, reason }

getPlayerProfile(sofascorePlayerId) -> object | null
getRecentMatches(teamId, count) -> object[]
getMatchPlayerStatistics(playerId, fixtureId) -> object | null
getLastFiveRatings(sofascorePlayerId, ratingsTeamId) -> { ratings, average, highest, lowest }
isConfigured() -> boolean
```

**Matching logic** (`scripts/lib/sofascoreMatching.mjs`) is also kept,
unwired but ready — pure functions, no network calls, scores candidates
by name similarity (Levenshtein, accent/case-insensitive) plus bonuses
for exact date-of-birth match, nationality match, and club overlap. Only
resolves to `matched` if the top candidate clears a confidence floor
*and* beats the runner-up by a clear margin — otherwise `ambiguous`,
never a silent guess. Verified directly against 5 scenarios (clear match,
same-name tie, DOB breaking that tie, unrelated name, no candidates).

**Postgres columns are already in place** on `players`
(`sofascore_player_id`, `sofascore_match_status`,
`sofascore_match_confidence`, `ratings_team_id`, `matches`,
`rated_matches_count`, `rating_average/highest/lowest`) and
`scripts/sync-scoutastic.mjs`'s upserts never touch them — only
SCOUTASTIC-owned columns are written, so a future ratings sync can freely
own these fields without any coordination needed.

## What's NOT ready — a real gap, not hidden

`scripts/sync-sofascore.mjs` still targets `data/players.json`, not the
real Postgres `players` table the rest of the app reads from — it
predates the Postgres migration the player sync itself already went
through (see `docs/SCOUTASTIC_SYNC.md`). Wiring up a real provider here
would need that same migration first (read candidate players from
Postgres by `sofascore_match_status`/`rated_matches_count` staleness,
write ratings back via upsert), or it would enrich a file nothing reads
in production anymore. Scope for that migration is the same shape as the
player sync's own rewrite — not attempted yet, since there's no real
provider to test it against.

`.github/workflows/sync-sofascore.yml`'s schedule is disabled
(`workflow_dispatch` only) for the same reason — nothing to run on a
schedule until a provider exists and the Postgres migration above is done.

## Scope, once revived: African debutant candidates only

By explicit decision, not the full player set (165,147 as of the last
full crawl) — whatever free/affordable tier a future provider offers is
very unlikely to cover that many players. The design already scopes to
`isAfrican && isEasternEuropeanLeague && !isYouthOrReserve` (directly
powers the African Debutants page, itself now populated for real by
SCOUTASTIC — see `docs/SCOUTASTIC_SYNC.md` — independently of ratings).
