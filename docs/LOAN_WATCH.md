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

## Where it lives

- `/loan-watch` — full page, minutes/position/age filters, paginated
  (`fetchLoanWatchCandidates()` in `src/lib/players-data/remote.ts`)
- Dashboard widget (top 5, default threshold) alongside Priority Players
- "Loan Watch" in the primary header nav
