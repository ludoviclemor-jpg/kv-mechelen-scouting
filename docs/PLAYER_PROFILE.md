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

## Career section — market value, injuries, youth clubs (2026-09-01)

Investigated live against real players (Mbappé, Haaland, Lamine Yamal)
before building anything, per the project's data-integrity rule:

- **Market value history** — `marketValueHistory` is real and confirmed:
  a dated array of `{marketvalue, date}` points, already requested on
  every squad crawl (`marketValues: "true"` was already on) but
  previously discarded entirely. Normalized to `{value, date}` and
  stored on `players.market_value_history`
  (`scripts/lib/fieldMap.mjs`'s `extractMarketValueHistory()`). Powers a
  real trend chart (`CareerHistorySection.tsx`'s `MarketValueTrend`) —
  never a synthesized curve from just the current value.
- **Injury history** — `injuryHistory` is real and confirmed: an array
  of `{season, from, to, injury}` spells (real examples: "Hamstring
  Injury", "Ankle Joint Injury", "Cruciate Ligament Rupture" with real
  date ranges). Gated behind `injuryData=true` on the request, which was
  previously left `false`; now `true` on the squad crawl
  (`scripts/lib/scoutasticClient.mjs`'s `fetchTeamPlayers`). `to` is
  genuinely `null` for an ongoing/unresolved injury — not a mapping gap.
  Stored on `players.injury_history`. Displayed most-recent-first,
  capped to a "quick recap" of the 8 most recent, with a real total
  count shown regardless.
- **Career club history — deliberately NOT built at the senior level.**
  `teams[]` on the player object only ever contains the player's
  *current* club + current national team — confirmed by checking Mbappé
  (Monaco→PSG→Real Madrid in real life) and Haaland (Salzburg→Dortmund→
  Man City): both show exactly 2 entries, no past clubs, on the live
  API. Tried several plausible extra query params (`transferHistory`,
  `transfers`, `careerHistory`, `teamHistory`) — none add anything
  beyond the baseline response shape. `performanceSummary` rows do carry
  a `teamId` per season, which could in principle reconstruct a rough
  season-by-season club history — but `teamId` doesn't resolve to a real
  name anywhere in this project's data (`scoutastic_teams.name` is never
  populated, it's a crawl-queue cache, not a name lookup; and many of
  these `teamId`s — youth teams, national youth teams — aren't even in
  `scoutastic_teams` at all), so this path was ruled out rather than
  shipped as a guess. `youthTeams` (confirmed real, e.g. Mbappé: "AS
  Bondy (2004-2011), INF Clairefontaine (2011-2013), AS Monaco
  (2013-2016)") is genuinely youth-career-only, stored as-is (raw
  free-text) on `players.youth_teams`, shown as its own "Youth Clubs"
  section — never mislabeled as senior transfer history. The current
  club is already shown in `PlayerHeader`, so it isn't repeated here.

Same backfill situation as `performance_seasons`/`played_positions`:
existing players only gain these three fields on their *next* crawl — a
150-team manual batch (2026-09-01) confirmed real values flowing
end-to-end (e.g. a real player with a genuine multi-point market value
history including a real drop to €0 and later recovery; a real player
with a confirmed "Cruciate Ligament Rupture" spell with real dates), the
rest fills in via the daily scheduled crawl over time.

## Season / competition selectors

`availableSeasons()`/`competitionsInSeason()` derive their options
directly from a player's own `performance_seasons` rows (club rows
only) — no separate lookup, no invented "available seasons" list.
Changing season clears an incompatible competition selection, same
cascading-filter convention used throughout the rest of the app.
