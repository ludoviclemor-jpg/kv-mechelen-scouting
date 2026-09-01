# Sportmonks ratings — TEST integration

A second, independent match-ratings source, deliberately kept separate
from the SofaScore/API-Football provider slot (`docs/SOFASCORE_PROVIDER.md`)
and its `players.matches`/`rating_*` columns. Scoped to two leagues as an
explicit trial: **Danish Superliga** and **Scottish Premiership** — the
leagues covered by Sportmonks' free plan.

## Architecture

```
Sportmonks API v3
      ↓ scripts/sync-sportmonks-ratings.mjs (service_role key, never in the browser)
player_external_ids / player_match_ratings   (Postgres)
      ↓ read at runtime, authenticated-only (db/rls_policies.sql)
src/lib/sportmonks-data/   (Client Components — player profile, homepage widget)
```

The frontend never calls Sportmonks directly — every read goes through
Supabase under RLS, same as every other data source in this app. The API
token only ever exists server-side (the sync script's own process env).

## What's confirmed against the real API (2026-09-01, Football Free Plan)

Base URL: `https://api.sportmonks.com/v3/football` (a separate
`https://api.sportmonks.com/v3/core` base exists too, used only for the
`/types` reference lookup — confirmed the hard way: `/football/types` is
a 404, `/core/types` is the real path). Auth: `api_token` **query
parameter**, not a header. Every response carries a `rate_limit:
{remaining, resets_in_seconds}` block — this token's plan allows 3000
requests/hour, generous next to API-Football's 100/day.

| Endpoint | What it returns | Notes |
|---|---|---|
| `GET /leagues` | Every league visible on this plan | `subscription[0].plans` names the active plan — the way this integration verifies the token/plan, since there's no dedicated "verify" endpoint |
| `GET /leagues/{id}?include=seasons` | One league + its seasons | Find `is_current: true` for the current season id |
| `GET /fixtures/between/{start}/{end}?filters=fixtureLeagues:{id}` | Fixtures in a date range, one league | `state_id` on each fixture — `5` = "FT" (Full Time), confirmed via `/states`. Only `5` is ever treated as "finished" here |
| `GET /fixtures/{id}?include=lineups.details.type;participants` | Full match sheet | `participants[]` (both teams, `meta.location` "home"/"away"); `lineups[]` (one per player: `player_id`, `player_name`, `team_id`, `type_id`, `details[]`) |
| `GET /players/{id}` | One player: `name`, `date_of_birth`, `nationality_id`, ... | Used sparingly — one request per player, only to break a matching tie |
| `GET /core/types` (2 pages, 500/page) | The full `type_id` reference table | Used only during investigation, not called at sync time |

**Confirmed `type_id` meanings** (via `/core/types`, not guessed):
`11` = "Lineup" (starter), `12` = "Bench" (substitute), `118` = "Rating"
(0–10 scale, e.g. `6.94` — exactly the scale this feature needed, no
rescaling), `119` = "Minutes Played". A lineup entry with no `118` detail
is a real unused substitute — never defaulted to a `0` rating.

**Danish Superliga**: Sportmonks league id **271**, confirmed current
season id `27897` ("2026/2027"). **Scottish Premiership**: Sportmonks
league id **501**, confirmed current season id `28275` ("2026/2027").

## Real example data retrieved

Danish Superliga — **Patrick Pentz** (Bröndby IF, goalkeeper), 4 real
ratings synced: 6.88 (vs Silkeborg IF, 24 Aug), 6.42 (vs Sønderjyske
Fodbold, 17 Aug), 7.69 (vs Horsens, 9 Aug), 7.31 (vs Viborg FF, 2 Aug) —
all 90 minutes, all starts.

Scottish Premiership — **Viljami Sinisalo** (Celtic FC, goalkeeper), 3
real ratings synced: 6.62 (vs Falkirk, 29 Aug), 7.52 (vs Kilmarnock, 9
Aug), 7.22 (vs Dundee, 3 Aug) — all 90 minutes, all starts.

Top of the real "Top Rated Players" result (last-5 average, ≥3 rated
appearances): Kieran Tierney (Celtic FC) 7.98, Camilo Durán (Celtic FC)
7.82, Darío Osorio (FC Midtjylland) 7.67.

## Player matching — real finding that changed the design

**`players.competition_id` cannot be used to scope "plays in this
domestic league."** It records whichever competition a player was
*discovered through* during the Scoutastic crawl — very often a European
qualifying round (`competition_id: "UNLB"` and similar), not the
domestic league, even when `club` correctly says e.g. "Celtic FC".
Confirmed directly: real players **Kieran Tierney** (Celtic) and
**Patrick Pentz** (Brøndby IF) both carry `competition_id: "UNLB"`, not
`SC1`/`DK1`. An earlier version of this sync filtered the matching
candidate pool by `competition_id` and silently missed both of them (and
many others) as a result — caught by testing against real data before
this was ever committed, not shipped.

**`club` is the reliable scoping signal instead.** `.eq("club", "Celtic
FC")` alone returns a real, correctly-sized ~27-player squad, regardless
of `competition_id`. `scripts/lib/sportmonksLeagues.mjs`'s
`clubAliases` maps each Sportmonks team name to the exact `players.club`
string Scoutastic uses for the same real club — built by comparing the
real team list from both providers (Sportmonks'
`/standings/seasons/{id}?include=participant`, Scoutastic's own synced
`club` values), not fabricated. Most differences are just accents (ö/ø)
or an "FC"/"AC" prefix Scoutastic adds and Sportmonks omits, but at
least one is a genuine translation ("FC København" vs "FC Copenhagen")
that no generic string-normalization could bridge alone.

**Matching order** (`scripts/sync-sportmonks-ratings.mjs`, using
`scripts/lib/sofascoreMatching.mjs`'s `resolveMatch`/`normalizeName`
reused as-is — provider-agnostic despite the filename):

1. An existing `player_external_ids` row for this Sportmonks player id — reused directly.
2. Name similarity (accents/case/hyphens/spacing normalized), scored against the club-scoped candidate pool.
3. If ambiguous, fetch this one Sportmonks player's `date_of_birth` (one API call) and re-score with it.
4. Still ambiguous or not found → skipped, logged, never guessed.

**Confirmed, load-bearing fact about `resolveMatch`'s scoring (see
`scripts/lib/__tests__/sportmonksMatching.test.mjs`): an exact name
match alone can never cross the 0.75 confidence threshold.** Name
similarity is weighted at 0.6, so even a perfect `1.0` similarity caps
out at `0.6` — below the threshold — every single time, by design. In
practice this means **every newly-matched player in this sync goes
through the date-of-birth lookup step**, not just the "genuinely
ambiguous" ones a name-only reading might expect. This is deliberate
conservatism (never auto-trust a name alone), confirmed on the real
2026-09-01 sync run, and costs roughly one extra `/players/{id}` call
per newly-matched player — well within the free plan's 3000/hour limit
at this scale, but worth knowing if the scope grows.

## Sync coverage (real run, 2026-09-01, `--days 35`)

- 44 finished fixtures fetched (25 Danish Superliga, 19 Scottish Premiership)
- 1,228 ratings stored
- **444 distinct Scoutastic players matched** (a fresh match, not reused from a prior run — the mapping table was empty at the start of this run)
- **53 distinct players left unmatched** (~10.7% of encountered players) — logged, not guessed, not stored

**Dominant unmatched pattern, confirmed by inspection, not assumed:**
Sportmonks' lineup `player_name` is often a short public name (e.g.
"Gabriel Pereira") while Scoutastic's `name` is the full legal name
(e.g. "Gabriel Pereira Magalhães dos Santos") — common for Brazilian/
Portuguese players. Levenshtein-based `nameSimilarity` penalizes this
length difference heavily, so these never reach the plausibility floor
and are never even offered a DOB lookup. **Not fixed in this delivery**
— a real, understood limitation, not a bug: fixing it well (e.g. a
token-containment bonus in `sofascoreMatching.mjs` for "shorter name's
words are a full subset of the longer name's words") would change scoring
behavior for the *other*, currently-unwired SofaScore/API-Football
provider slot too, and deserved dedicated testing rather than a
same-session tweak under time pressure. Worth a follow-up if match
coverage needs to improve.

A second, smaller pattern: initials-only Sportmonks names ("O. Buur", "C.
Winther") against full first names in Scoutastic — same root cause,
same fix candidate.

## Adding more leagues later

Two arrays are the entire surface area:
`scripts/lib/sportmonksLeagues.mjs`'s `SPORTMONKS_LEAGUES` (sync side —
add `{ sportmonksLeagueId, name, clubAliases }`) and
`src/lib/sportmonks-data/constants.ts`'s `SPORTMONKS_LEAGUE_FILTERS`
(frontend filter dropdown — add `{ id, name }`, matching the Sportmonks
league id as a string). `clubAliases` needs one entry per club whose
Scoutastic `club` string differs from Sportmonks' team name — build it
the same way as this doc's Danish/Scottish crosswalk: compare
`/standings/seasons/{id}?include=participant` against a real
`select distinct club from players where club similar to X` query,
never guessed.

## Rate limiting, retries, caching

`scripts/lib/sportmonksClient.mjs`'s `sportmonksGet()` retries on
429/5xx/timeout with exponential backoff, and proactively sleeps until
the rate-limit window resets if `rate_limit.remaining` drops below 30 —
rather than firing a request that's already guaranteed to 429.

"Caching" here means the sync never re-fetches a fixture it has already
stored ratings for: before fetching lineups, it queries
`player_match_ratings` for which of the window's fixture ids already
have `provider='sportmonks'` rows, and skips those. A genuinely new
finished fixture is always fetched exactly once across repeated daily
runs.

## Error handling

Every Sportmonks-specific failure logs one of the four phrasings the
integration was specified to use — `[Sportmonks fixture request
failed]`, `[Sportmonks player could not be matched]`, `[Sportmonks rate
limit reached]` — and the sync continues with the next fixture/league
rather than aborting. On the frontend, `fetchPlayerRecentPerformance`/
`fetchTopRatedPlayers` go through the same `useAsync` hook as every
other data fetch in this app: a failure lands in `error`/`data: null`,
never an unhandled render crash, and the rest of the player profile page
renders normally regardless.

## Limitations discovered

- **No Sportmonks integration test can run without a real API token** —
  by design, nothing here is testable end-to-end without one (see
  `scripts/test-sportmonks.mjs`).
- **`competition_id` cannot scope "plays in this league"** — see the
  matching section above; this shaped the whole candidate-pool design.
- **Short/public name vs full legal name is the dominant real matching
  gap** — ~10.7% of encountered players in this test run, understood but
  not fixed this round (see above).
- **An exact name match alone never auto-confirms** — every fresh match
  costs one extra `/players/{id}` call for DOB confirmation, by the
  shared matching module's own conservative design.
- **Season average is scoped to the most recent `season_id` only** — a
  player with ratings spanning more than one season in the sync window
  (a genuine mid-window edge case, not expected in the 35-day default)
  would not have those blended.
- **Free plan = 2 leagues only.** Both Danish Superliga and Scottish
  Premiership are genuinely covered (`subscription[0].plans` confirms
  "Football Free Plan"); anything beyond needs a paid plan and a new
  `clubAliases` entry per added league.
