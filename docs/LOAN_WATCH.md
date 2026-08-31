# Loan Watch

"Find possible players that could leave on loan" was the original ask,
specifically including "public statements where it's said/rumoured they
could leave on loan." That half is **not built** — confirmed, thoroughly,
in the same investigation that ruled out the Market Watch feature
earlier in this project (see the transfer-rumours findings from that
session): SCOUTASTIC has no rumour, news, or public-statement data of
any kind. There is no endpoint, no field on the player object, nothing.
Building that part would mean either inventing data or scraping a
third-party source — both explicitly ruled out for this project.

## What's built instead: Limited Game Time

The real, data-backed proxy for "might leave on loan" — players who
aren't getting picked. Genuinely useful for the same purpose (a player
stuck behind the pecking order at their club is exactly the kind of
player a loan move gets discussed for), and entirely derived from real
minutes/appearances data, never speculation.

**Query:** `players.minutes <= threshold` (default 450 — roughly five
full matches, an adjustable heuristic, not a rule), using the existing
`players.minutes`/`appearances` scalar columns — this season's *club*
output only, already excludes international caps (see
`docs/PLAYER_PROFILE.md`'s bug-fix note on `currentSeasonStats()`).
Deliberately reuses these lightweight columns rather than the heavier
`performance_seasons` column, so the query stays a plain indexed scan
across the full player table instead of pulling a JSONB blob per row —
same reasoning documented for every other paginated list
(`PLAYER_COLUMNS` in `src/lib/players-data/remote.ts`).

**Caveats, stated plainly:**
- Early in a season, this will over-flag almost everyone — there's no
  "season progress" signal to normalize against, so the threshold is a
  rough heuristic a scout should sanity-check, not a verdict.
- A low-minutes player could be injured, suspended, or a genuine academy
  prospect rather than a loan candidate — this surfaces a real signal
  worth checking, not a conclusion.

## "Professional leagues only" — real bug found and fixed

Confirmed live against the actual candidate pool: without a tier filter,
~1/3 of results came from `competition_id`s whose `level_definition` is
a **cup** context ("Domestic Cup", "Further Cup") — a player's crawl
context being a cup tells nothing about their real league level, since
`players.competition_id` is just whichever competition their squad crawl
happened to go through. Worse, real youth-league players were leaking
in despite the existing `is_youth_or_reserve` filter — that flag is
`false` for every single row regardless of reality (a known, separate
data gap, see `docs/SCOUTASTIC_SYNC.md`), so it filters nothing.

The Level filter (`fetchProfessionalCompetitionIds()` in
`src/lib/players-data/remote.ts`) fixes both: it resolves the player's
tier from `scoutastic_competitions.level_definition` restricted to the
six genuine league-tier values ("First Tier" .. "Sixth Tier" — excludes
every cup/youth-league/reserve/regional/national-team value), at or
above a selectable cutoff (default: top 3 tiers). "Professional" is
genuinely ambiguous below the top couple of tiers — it varies by
country — so this is an adjustable filter, not a silently hardcoded
rule; "All levels" keeps the full crawled pool, cups and amateur tiers
included.

No FK exists from `players.competition_id` to `scoutastic_competitions`
(a soft reference — see `db/schema.sql`), so this is a two-step fetch:
resolve the matching competition ids first (139-354 depending on the
cutoff, confirmed live, comfortably within a safe `.in()` size), then
filter players by that id list.

## Region filter (Top 5 / Benelux / Scandinavia / Others)

A grouped shortcut over the existing Country filter, since scouts
naturally think in these blocs rather than picking one country at a
time. Country names confirmed live against `players.league` before
building the groups (`England`, `Spain`, `Germany`, `Italy`, `France`
for Top 5; `Belgium`, `Netherlands` for Benelux — Luxembourg
deliberately excluded, its clubs are genuinely amateur-tier in
SCOUTASTIC's data, not what a scout means by this grouping;
`Norway`, `Sweden`, `Denmark` for Scandinavia in the strict sense —
Finland/Iceland are Nordic but not Scandinavian, left out rather than
assumed included). "Others" is everything not in any of the three
groups. Picking a Region clears the individual Country filter (and vice
versa) since both filter the same underlying column — letting them
disagree silently would just return nothing with no indication why.

## Where it lives

- `/loan-watch` — full page, minutes/position/age filters, paginated
  (`fetchLoanWatchCandidates()` in `src/lib/players-data/remote.ts`)
- Dashboard widget (top 5, default threshold) alongside Priority Players
- "Loan Watch" in the primary header nav
