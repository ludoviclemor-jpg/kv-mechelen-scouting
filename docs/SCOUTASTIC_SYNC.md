# SCOUTASTIC player sync

How real player data gets from SCOUTASTIC into Postgres, and what's
actually confirmed against the live API vs. still unverified. See
`docs/COMPETITIONS.md` for the competition/team catalog side of this same
architecture (`scripts/sync-competitions.mjs`) — this document covers the
player-squad crawl that depends on it.

## Architecture (current, working, tested 2026-08-31)

```
GET /competitions (SCOUTASTIC)
      ↓ scripts/sync-competitions.mjs (own workflow, see docs/COMPETITIONS.md)
scoutastic_competitions, competition_teams, scoutastic_teams   (Postgres)
      ↓ scoutastic_teams is the crawl queue, ordered by last_crawled_at
scripts/sync-scoutastic.mjs   (.github/workflows/sync-scoutastic.yml)
      ↓ GET /players?teamId=...&debuts=true per team (batched)
      ↓ mapScoutasticPlayer() (scripts/lib/fieldMap.mjs)
      ↓ upsert (service_role key — never exposed to the browser)
players   (Postgres)
      ↓ read at runtime, authenticated-only (db/rls_policies.sql)
Next.js static export → GitHub Pages (src/lib/players-data/remote.ts)
```

There is no live backend server and the frontend never talks to
SCOUTASTIC or sees its API key — it only ever reads `players` through
Supabase's REST API under RLS, same pattern as shortlists/notes and the
Competitions feature (`docs/POSTGRES_PERSISTENCE.md`).

**Scope:** only teams belonging to an active, `ageCategory: "Senior"`,
`gender: "male"`, European (`association: "UEFA"`) competition are ever
crawled — 6,993 teams as of the last full competition discovery (see
`docs/COMPETITIONS.md`'s real numbers). `scoutastic_teams` (the crawl
queue) only ever contains teams in this scope; `competition_teams` itself
still records links for every competition worldwide, kept separate on
purpose.

**Batching:** deliberately not a single full pass — `--batch-size`
(default 500 via the workflow's `workflow_dispatch` input, GitHub
Actions' scheduled run also defaults to 500) teams per run, picked by
oldest `last_crawled_at` first (nulls first), same reasoning as
`scripts/sync-sofascore.mjs`. A team already crawled keeps its place in
line; nothing is skipped, nothing is repeatedly re-crawled while older
teams wait. At ~0.5–0.6s/team (delay + request time, confirmed via a real
20-team run), a full first pass over all 6,993 teams is on the order of
an hour of actual crawl time, spread across many scheduled runs rather
than attempted in one.

## What's confirmed against the real API

Everything in `scripts/lib/scoutasticClient.mjs` and
`scripts/lib/fieldMap.mjs` is verified directly against real responses —
nothing is guessed:

- Base URL: `https://kvmechelen.scoutastic.com/api/v1`
- Auth: `Authorization: <api_key>` header (the raw key, **not** `Bearer <key>`)
- `GET /players?teamId=...&...` — a **Mongoose-paginate wrapper**
  (`{ docs, totalPages, page, hasNextPage, nextPage, ... }`), not a bare
  array. `fetchTeamPlayers()` walks every page (squads have stayed under
  one page of 100 in practice, but this doesn't assume that).
- `debuts` — confirmed real on **both** `/player?externalId=...` and
  `/players?teamId=...` (same shape either way): an array of
  `{ date, competitionExternalId, matchExternalId, teamExternalId,
  opponentExternalId }` — one entry per competition the player has ever
  appeared in, **not** a single career-debut flag. See "Debut detection"
  below for how this is used.

**Field mapping — confirmed, not assumed:**

| Our field | Raw SCOUTASTIC field | Notes |
|---|---|---|
| `scoutasticPlayerId` | `transfermarktId` | **Not** `externalId` — that field doesn't exist on the player object itself (only as the query param name, and on nested `teams[]` entries). |
| `name` | `firstName` + `lastName` | |
| `photoUrl` | `imageUrlV2` | `imageUrl` also exists but 401s without the API key — confirmed by a direct unauthenticated request. Only `imageUrlV2` is safe to use in a public `<img>` on GitHub Pages. Both are relative paths; `imageUrlV2` is joined with the API's origin (`https://kvmechelen.scoutastic.com`, not `/api/v1`). |
| `position` | `mainPosition` | Mapped via `src/lib/scoutastic/config/positionMap.json`. Real data includes both British and American spellings (`centreback`/`centerback`) and non-formation values (`substitute`) — the map handles both. |
| `secondaryPositions` | `secondaryPosition1`, `secondaryPosition2` | |
| `club` | `teams[]` entry where `isMain === true` | |
| `heightCm`, `preferredFoot`, `agent`, `marketValueEUR`, `contractExpiry`, `nationality`, `secondNationality`, `dateOfBirth` | `height`, `foot`, `agent`, `marketValue`, `contractExpires`, `nationality`, `secondNationality`, `dateOfBirth` | |
| `appearances`, `minutes`, `goals`, `assists` | `performanceSummary[latestSeasonYear]`, summed across every competition played that season | Requested via `performanceSummary=true`. `performanceHistory` (per-match detail, confirmed real and useful for minutes/starter-vs-sub per match — see `docs/COMPETITIONS.md`) is deliberately left `false` on the bulk squad crawl — its payload is ~250 rows per player, too heavy to request for every player on every team; not yet wired into a targeted follow-up enrichment pass. |
| `isDebutant`, `debutDate` | `debuts[]`, cross-referenced against the crawl's own competition context | See "Debut detection" below — genuinely computed, not a placeholder. |

**Still `null` — no confirmed source:** `previousClub`, and any secondary
position beyond the two SCOUTASTIC returns.

**Real player-id gotcha:** squad-crawl entries and the single-player
endpoint both use `transfermarktId`, not `externalId`, as the actual
unique id.

## Debut detection

`debuts[]` is "first appearance **per competition**," not "career
debut" — a real player can have a dozen+ entries spanning every
club/cup/international tournament they've ever featured in, including
youth internationals (confirmed via a real player: 16 entries spanning
`AR1N` league, `CLI` continental cup, `20WC` U20 World Cup, senior
internationals, all in the same array, same shape). Naively treating any
`debuts` entry as "this player just debuted" would flag almost every
player in the database.

`mapScoutasticPlayer()`'s `detectDebut()` (in `scripts/lib/fieldMap.mjs`)
scopes this down to something meaningful:

1. Only looks for a `debuts` entry matching the **specific competition
   this player was just crawled through** (`context.competitionId` — the
   team/league that got us this player), not any competition anywhere in
   their career.
2. Only counts if that debut happened within `DEBUT_RECENCY_DAYS` (270
   days, ~one season) of the sync run — otherwise a player who debuted
   years ago and simply still plays for the same club would read as a
   fresh debutant forever.

**Known data-quality caveat, confirmed real, not a bug in this code:**
for at least one obscure, likely-recently-backfilled competition (Ireland's
third-tier `IRL3`), every single player on a squad showed the *identical*
debut date — almost certainly the date SCOUTASTIC computed/indexed that
competition's historical debut records in one batch, not each player's
actual first-appearance date. Checked against a long-tracked top-tier
competition (Belgium's `BE1`, Jupiler Pro League) for comparison — debut
dates there are realistically spread across 2013–2026, no such artifact.
This means debutant counts for lower-tier or newly-covered competitions
should be treated with more skepticism than well-established top
divisions; no filtering heuristic has been built for this (deliberately —
not enough confirmed real cases yet to trust one over just documenting
the caveat).

## Upsert logic

Players are matched by `scoutastic_player_id` (`onConflict:
"scoutastic_player_id"`). Only SCOUTASTIC-owned columns are ever included
in the upsert payload — ratings fields (`sofascore_*`, `matches`,
`rating_*`) are never touched by this script, so Postgres's `ON CONFLICT
DO UPDATE` leaves them exactly as they were; no manual "preserve" merge
logic is needed the way the old `data/players.json`-based design required
(see git history for that if curious — it's genuinely simpler now that
this is a real upsert against a real database, not a hand-rolled merge
into a JSON blob).

**Known gap, not yet built:** no deactivation logic. A player who leaves
a squad isn't marked `active: false` — `players` has no `team_id` column
to reliably detect "no longer on this squad" against (only a `club` name
string, which name-matching alone isn't reliable enough for). Worth
building once there's a real need to notice players leaving; not blocking
for now since the upsert side (new/changed players) is what matters most
for a scouting tool.

## Running it

Credentials are read **exclusively** from environment variables — never
written to any file this script produces, never printed, never
committed. Locally, set them in your shell profile (`~/.zshenv` for zsh —
not `~/.zshrc`, which only loads for interactive shells).

```bash
# Inspect one team's raw response (with debuts) without writing anything
node scripts/sync-scoutastic.mjs --inspect-team 294

# Test the crawl against the real queue/competitions, writing nothing
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-scoutastic.mjs --dry-run --batch-size 5

# Real run
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-scoutastic.mjs --batch-size 500
```

Flags: `--dry-run`, `--batch-size` (default 500), `--delay-ms` (default
250), `--retries`, `--gender` (default `male`), `--only-team <id>`
(force-crawl one specific team, ignoring the queue — for testing), `--inspect-team <id>`.

## Production

`SCOUTASTIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are GitHub Actions
repository **secrets**; `NEXT_PUBLIC_SUPABASE_URL` (reused as-is — same
value, already public) is a repository **variable**. The
`sync-scoutastic.yml` workflow runs daily by schedule, or on-demand via
`workflow_dispatch` with a configurable batch size. Run
`scripts/sync-competitions.mjs`'s own workflow at least once first — this
crawl's queue and league-context lookups depend on the catalog it builds.

## Verified

A real batch run (`--batch-size 20`, 2026-08-31) against the live
database: 20 teams crawled (Ireland `IRL3`, France lower divisions), 540
players retrieved and upserted with zero failures, real field values
confirmed in Postgres afterward (name, nationality, position, club,
league, competition_id, market value, contract expiry all populated
correctly), 215 debutant flags set (40 of them African), `last_crawled_at`
correctly advanced on all 20 teams. A subtle but real pagination bug was
caught and fixed in the process: PostgREST silently caps an unpaginated
`.select()` at 1,000 rows, which would have made the competition-scope
lookup (2,435 rows) and the crawl-queue cleanup work against an
incomplete, arbitrary subset — `fetchAllRows()` in
`scripts/sync-scoutastic.mjs` paginates properly now.
