# First international call-ups

How "First International Call-Ups" is detected, and — critically — why
it tracks a genuinely different thing than "first international
appearance." Both concepts exist in the real SCOUTASTIC data; conflating
them was explicitly flagged as a mistake to avoid.

## Call-up vs. appearance — confirmed real, and different

A **call-up** is being selected for a national-team matchday squad. An
**appearance** (a "cap") is actually playing minutes in a match. A player
can be called up and not play a single minute (an unused substitute, or
an unused non-travelling squad member for one specific match) — that
happens constantly in real football and is the entire reason these are
different concepts.

Confirmed live (2026-08-31) via `GET /matches?competitionId=WMQ6&season=2024`
for a real Belgium World Cup qualifier: the match's `homeTeamPlayers`/
`awayTeamPlayers` array is a real 23-player matchday squad — 11 starters
(`inLineup: true`) plus 12 substitutes (`inLineup: false`), several of
whom show `minutesPlayed: 0` — genuinely selected, genuinely unused. That
`minutesPlayed: 0` / `inLineup: false` combination is the real, confirmed
signal for "called up, didn't play."

By contrast, `debuts[]` on the player object (used elsewhere in this
project for club debut detection, see `docs/SCOUTASTIC_SYNC.md`) is
"first appearance **per competition**" — it only has an entry once a
player has actually played. It cannot tell you about a call-up that
hasn't yet turned into an appearance, and using it here would silently
collapse "first call-up" into "first appearance" — exactly what this
feature is not supposed to do.

## Identifying international competitions — confirmed real, not guessed

`scoutastic_competitions.level_definition` distinguishes genuine
national-team competitions from everything else, confirmed by querying
our own already-synced catalog (`sync-competitions.mjs` already pulls
every SCOUTASTIC competition, national teams included — no new discovery
endpoint was needed):

| `level_definition` | What it real is | Included? |
|---|---|---|
| `National Team` | Senior national-team tournaments/friendlies (World Cup, EUROs, Nations League, friendlies) | Yes |
| `National team's qualifiers` | Senior national-team qualifiers | Yes |
| `Youth National Team Qualifiers` | Youth national-team qualifiers (U17–U21) | Yes |
| `National youth team` | Youth national-team tournaments (confirmed real examples: CAFA U17 Championship, EAFF U15 Championship, ASEAN U23 Championship) | Yes |
| `International Cup` / `International Super Cup` | **Club** continental competitions (FIFA Club World Cup Qualifier, Intercontinental Cup) | No |
| `International Youth Cup` | **Club academy** competitions (UEFA Youth League, Premier League International Cup) — teams are clubs, not countries | No |

The first four values are the complete, confirmed rule. The last two look
similar by name but are club football, not national-team football —
verified by inspecting real competitions under each label before deciding
to exclude them (e.g. `International Youth Cup` includes "UEFA Youth
League," which is Champions League for U19 club academy sides — including
it would wrongly credit "international call-ups" for club youth football).

`level` on `player_international_callups` is copied straight from the
matched competition's `age_category` at sync time (`Senior`, `U21`,
`U20`, `U19`, `U18`, `U17`, or occasionally something else SCOUTASTIC
returns, e.g. `U23`/`U16`/`U15` for some confederations) — not a fixed
enum, since SCOUTASTIC's own values aren't one either.

## Scope — confirmed real numbers (2026-08-31)

92 active international competitions across every confederation and age
level, ~1,600 matches for the current season alone across all of them
combined — small enough to sync in one non-batched pass (comparable to
`sync-competitions.mjs`, far smaller than the club match/player crawls).
`sync-international-callups.mjs` covers each competition's `--seasons`
most recent seasons (default 2) for a small safety margin against a
call-up that happened just before the "current season" boundary.

## Architecture

```
scoutastic_competitions (already synced, level_definition confirms scope)
      ↓
scripts/sync-international-callups.mjs
      ↓ GET /matches?competitionId=...&season=... per (in-scope competition, recent season)
      ↓ cross-reference every home/away lineup player id against `players`
      ↓   (only players we already track are ever persisted — this is not
      ↓    a crawl of every capped player worldwide)
      ↓ reduce to the earliest match date per (player, level)
player_international_callups   (Postgres — one row per player x level)
      ↓ read at runtime, authenticated-only (db/rls_policies.sql)
Dashboard "First International Call-Ups" widget + /call-ups page
```

Re-running the sync only ever moves `first_call_up_date` **earlier**,
never later — a later run whose season window happens to be narrower
than an earlier one can't regress an already-detected earlier call-up
(see the sync script's step 5).

## What this can't do

- **Historical depth is bounded** (`--seasons`, default 2) — a player
  whose actual first call-up happened further back than the synced
  window won't show the true first call-up date, only the earliest one
  found within scope. Re-running with a larger `--seasons` value would
  extend coverage; not done by default to keep the sync cheap.
- **A squad announced but never actually fielded in a match this project
  can see is invisible** — SCOUTASTIC's `/matches` squad list is a
  matchday squad, not a pre-match provisional squad announcement (which
  SCOUTASTIC doesn't appear to expose separately). This is still a real
  improvement over appearance-only detection (it catches unused
  substitutes), just not a claim of capturing every squad announcement
  that ever existed.
