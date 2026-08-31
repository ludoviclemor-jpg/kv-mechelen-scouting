# Explore — match browsing and pitch view

Browse real matches by day, open a match, see the official lineup on a
pitch with real formations. SCOUTASTIC is the source of truth for
everything except the per-match SofaScore rating slot, which stays
genuinely empty until a real ratings provider exists (see
`docs/SOFASCORE_PROVIDER.md`) — never approximated.

## What's confirmed against the real API (2026-08-31)

`GET /matches` — discovered while auditing this feature, never tested
before now. Returns a genuinely complete match sheet, not partial data:

| Field | Confirmed real example | Notes |
|---|---|---|
| `homeTeamTactic` / `awayTeamTactic` | `"4-2-3-1"`, `"4-3-3 Attacking"` | Real formation strings — sometimes carry a trailing qualifier word |
| `homeTeamPlayers` / `awayTeamPlayers` | array of 20+ entries | Full squad for the match: `id`, `firstName`, `lastName`, `mainPosition`, `lineUpIdx` (pitch position order, 1-11 for starters), `inLineup` (starter vs. bench), `minutesPlayed`, `goals`, `assists`, `shirtNumber`, `captain` |
| `events` | array | Goals, assists, substitutions (with `gameMinute`), cards — a real match timeline |
| `venueName`/`venueCity`/`venueArea` | `"Het Kuipje"`, `"Westerlo"` | |
| `refereeName` | `"Simon Bourdeaud'Hui"` | |
| `score`/`scoreHome`/`scoreAway`/`status` | `"2:2"` / `"played"` | Confirmed status values so far: `"played"`, `"open"` — not treated as an exhaustive enum |
| `competitionId`/`competitionArea` | `"BE1"` / `"Belgium"` | Matches `scoutastic_competitions` exactly |

**Critical gotcha, confirmed the hard way:** `date` and `matchId` are
**not** real filters on this endpoint — passing either returns the same
unfiltered ~1.17M-row total regardless, silently, no error. Only
`competitionId` and `season` actually filter results. This is why
"browse matches by day" needed a sync into Postgres (`matches` table,
`scripts/sync-matches.mjs`) rather than querying SCOUTASTIC live —
Postgres does the date filtering SCOUTASTIC's API can't.

Position strings in `mainPosition` (`"centerback"`, `"rightwing"`, etc.)
are the exact same vocabulary as `src/lib/scoutastic/config/positionMap.json`,
already used for players — reused directly, not remapped.

## Architecture

```
GET /matches?competitionId=X&season=Y (SCOUTASTIC)
      ↓ scripts/sync-matches.mjs (service_role key)
matches   (Postgres — full match sheet: lineups, formations, events)
      ↓ read at runtime, authenticated-only (db/rls_policies.sql)
/explore, /explore/match?id=...   (Client Components — src/lib/matches-data/)
```

Scoped to each in-scope competition's **current season only** (from
`scoutastic_competitions.current_season`, already known from
`scripts/sync-competitions.mjs`) — not SCOUTASTIC's full historical
archive, which goes back to the 1970s-1990s for some competitions.
Explore is about browsing recent/current matches, not deep history.

**Verified real run (2026-08-31):** 426/426 in-scope competitions synced,
67,700 matches, zero failures, ~366s. Real day counts confirmed
non-trivial: 716 matches on 2026-08-30, 149 on 2026-08-31, 127 on
2026-09-01 — plenty of real data for the date-browsing UX.

## Pitch layout — real data, never a randomized guess

`src/lib/formation.ts`'s `buildPitchRows()`:

1. Parses the formation string into row sizes (`"4-2-3-1"` → `[4,2,3,1]`,
   ignoring trailing qualifier words like "Attacking").
2. Sorts starters (`inLineup: true`) by SCOUTASTIC's own `lineUpIdx` —
   the authoritative ordering, never invented.
3. First player (`lineUpIdx: 1`) is always the goalkeeper, own row.
4. Remaining 10 outfield starters are sliced into the formation's rows,
   in `lineUpIdx` order.

If the formation string doesn't parse, or the starter count isn't
exactly 11 (a partial/missing lineup), `buildPitchRows()` returns `null`
and the UI shows "Formation unavailable" — never a fabricated layout.

## Player identity — reuses the existing player pipeline, not duplicated

A match lineup entry's `id` is the same SCOUTASTIC player id used
everywhere else (`sc-{id}` matches `players.id`) — the match detail page
resolves real `Player` records via the **existing**
`fetchPlayersByIds()` (`src/lib/players-data/remote.ts`), unchanged. A
lineup player SCOUTASTIC hasn't synced into `players` yet (not every
match's opposition has necessarily been crawled — see
`docs/SCOUTASTIC_SYNC.md`'s scope) still renders on the pitch from the
match sheet's own fields, just without birth year/nationality/shortlist
data until that player is synced.

## SofaScore match ratings — the ready slot, genuinely empty today

`matchRatings` (a `Map<lineupPlayerId, number>`) is threaded through
every pitch/bench/drawer component as its own value, always empty today
— no real provider is connected (`docs/SOFASCORE_PROVIDER.md`). Every
player correctly shows "Rating unavailable," not a season average, not a
last-5 average, not an approximation. Wiring up a real provider later
means populating this one map from a real per-match rating lookup — no
component changes needed.

## Not yet built (scoped out of this pass, not hidden)

- Advanced Explore filters (club, age, African-only, shortlisted-only) —
  the current pass ships date navigation + country/competition grouping;
  cascading filters across the whole app (Players, Debutants, Top
  Performers, Competitions, Explore) are explicitly a separate, later
  phase per the user's own sequencing decision.
- Per-chip shortlist/African accents on the pitch use the already-synced
  `players` table — a lineup player who hasn't been crawled yet won't
  show these accents even if they would otherwise qualify.
