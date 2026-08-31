# Player profile — stats, game time, international status, position usage

The redesigned `/player?id=...` page (Phases 7-9 of the major dashboard
upgrade). Covers what SCOUTASTIC actually supports for each section, and
— just as important — what it doesn't, so nothing here is invented.

## What SCOUTASTIC's `performanceSummary` actually supports

Confirmed live (2026-08-31) against real players: each row (one per
season + competition) carries `matchesPlayed`, `minutesPlayed`,
`substitutes` (sub-appearance count), `goals`, `assists`, `ownGoals`,
`yellow`/`red`/`yellowRed`, `cleanSheets`, `opponentGoalsOnThePitch`.
That's the complete set — **no passing, tackle, or duel data exists
anywhere in the confirmed API surface**.

This directly shapes the Stats Overview: only **Attacking** (goals,
assists), **Discipline** (cards), and **Goalkeeping** (clean sheets,
goals conceded — goalkeepers only) ever render. Passing/Defending/Duels
categories are never shown, not even empty — SCOUTASTIC has nothing to
put in them, and rendering an empty category would misleadingly imply
data almost exists. `starts` is a derived value
(`matchesPlayed - substitutes`) since SCOUTASTIC doesn't return a
separate "starts" field — the one reasonable reading of what it does
return.

## Why `performance_seasons` is a new column, not a recomputation

`performanceSummary` was already being fetched (`performanceSummary=true`
on every squad-crawl request) but only ever reduced to a single
current-season scalar (`appearances`/`minutes`/`goals`/`assists` on
`players`) — the full per-season, per-competition breakdown was
discarded. `scripts/lib/fieldMap.mjs`'s `extractPerformanceSeasons()`
now keeps it all, flattened into `players.performance_seasons`, each row
tagged:

- `isInternational` — using the same confirmed
  `level_definition`-based rule as `docs/INTERNATIONAL_CALLUPS.md`
  (`scripts/lib/internationalCompetitions.mjs`, a single shared source
  used by both this sync and `sync-international-callups.mjs`).
- `level` — the competition's own `age_category` ("Senior", "U21", ...),
  looked up from the same competition catalog already loaded during the
  crawl. `null` if the competition isn't in our own catalog yet.

**Real bug found and fixed in the process:** the old current-season
reduction summed *every* row for the latest season year regardless of
competition — a player capped internationally in the same calendar year
as their club season had those appearances silently merged into "this
season's club output." `currentSeasonStats()` now excludes international
rows from that club-facing aggregate.

Deliberately kept off the shared `Player` type and `PLAYER_COLUMNS` —
`fetchPlayerPerformanceDetail()` fetches it separately, only on the
player profile page, so every paginated list view (Players, Debutants,
Top Performers, ...) keeps querying the same lightweight row it always
has.

## International status — caps by level

Computed by grouping `performance_seasons`' international rows by
`level` and summing `matchesPlayed`/`goals` (`capsByLevel()` in
`src/lib/players-data/performance.ts`) — a real, derived aggregate, not
a separate SCOUTASTIC field. The "NEW INTERNATIONAL CALL-UP" banner is a
separate, independently real signal from `player_international_callups`
(see `docs/INTERNATIONAL_CALLUPS.md`) — a player can have caps history
without a *recent* call-up in our sync window, or vice versa.

## Position usage — real per-position appearance counts

`playedPositions` (e.g. `{"leftback": 23, "rightcenterback": 3}`) is
real, confirmed available on every squad-crawl response at **no extra
API cost**, previously discarded entirely. Stored as-is (raw SCOUTASTIC
position codes, not reduced through `positionMap.json`'s 11-value
`Position` union — that reduction would lose exactly the left/center/
right distinction this feature needs) on `players.played_positions`.

**Pitch coordinates are a pattern-based classifier, not an exhaustive
table** (`src/lib/positionPitch.ts`) — only a handful of raw codes were
directly confirmed from real player samples (`leftback`,
`rightcenterback`, `leftwingback`, `attackingmidfieldleft`,
`defensivemidfieldright`, etc.), but they consistently follow a
`{side}{role}` / `{role}{side}` concatenation. The classifier matches on
that confirmed convention rather than a hardcoded list of only the exact
strings seen so far — but a code that still doesn't match anything
returns `null` and is listed as text rather than plotted at a guessed
location (`PositionUsagePitch.tsx`'s "position code not recognized for
pitch placement" list).

**When `played_positions` is empty** (a player not yet re-crawled since
this field was added — see "Backfill" below — or one SCOUTASTIC
genuinely has nothing for), the UI shows the player's *registered*
`position` with an explicit "data unavailable" state, per item 16's
requirement to never present a registered position as if it were
match-verified usage.

## Backfill

Existing players only gain `performance_seasons`/`played_positions` on
their *next* crawl — adding a column doesn't retroactively populate
~115k+ already-synced rows. The daily scheduled crawl (500 teams/batch)
will reach every player over time; a larger one-off batch
(`--batch-size 3000`) was also run manually to backfill a meaningful
slice immediately rather than waiting on the schedule alone.

## Season / competition selectors

`availableSeasons()`/`competitionsInSeason()` derive their options
directly from a player's own `performance_seasons` rows (club rows
only) — no separate lookup, no invented "available seasons" list.
Changing season clears an incompatible competition selection, same
cascading-filter convention used throughout the rest of the app.
