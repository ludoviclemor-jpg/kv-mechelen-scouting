# SCOUTASTIC sync

How real player data gets from SCOUTASTIC into this dashboard, and what's
actually confirmed against the live API (as of 2026-08-30) vs. still
unverified.

## Architecture rework in progress (2026-08-31)

Everything below this note describes the **Phase 2 architecture**
(competitions.json's ~34 curated competitions → `data/players.json`,
8,454 players). That's being replaced — SCOUTASTIC's real `GET
/competitions` endpoint (no id — confirmed to exist, returns **all
2,439 competitions** in its database, not just the curated list) makes
"every competition" a real, explicit request (`"Truly everything — rework
the architecture first"`), and at that scale (~725 active senior
competitions worldwide once filtered, ~15,989 teams, an estimated
400,000–480,000 players) neither a committed JSON file nor one static
HTML page per player survives — see `db/schema.sql`'s header.

**Done so far:** the Postgres side — `players`, `sync_meta`,
`scoutastic_competitions`, `scoutastic_teams` (the crawl queue/cache, see
below), the `player_*` filter views, all in `db/schema.sql` /
`db/rls_policies.sql`; and the entire frontend now reads player data from
Postgres at runtime instead of a build-time `data/players.json` import
(`src/lib/players-data/remote.ts`, see `docs/POSTGRES_PERSISTENCE.md`).

**Not done yet:** `scripts/sync-scoutastic.mjs` itself is still the old
Phase 2 script (curated competitions → `data/players.json`) — it has not
been rewritten to (a) discover competitions via `GET /competitions`
instead of the curated list, (b) crawl in a batched/resumable way against
`scoutastic_teams` as a work queue (mirroring `scripts/sync-sofascore.mjs`'s
proven pattern — a full crawl at this scale is many requests, likely
spread across many scheduled runs, not one), or (c) write to Postgres
(via a `service_role` key — GitHub Actions secret only, never committed)
instead of `data/players.json`. Until that's done, the architecture below
is provisioned but has nothing populating it yet — the frontend will show
an empty player database against a freshly-migrated Supabase project
until either the old sync is pointed at Postgres or the new one is built.

## Architecture (Phase 2 — being replaced, see above)

```
SCOUTASTIC API
      ↓ (SCOUTASTIC_API_KEY — GitHub Actions repository secret, server-side only)
scripts/sync-scoutastic.mjs   (.github/workflows/sync-scoutastic.yml)
      ↓ upserts
data/players.json             (committed to the repo — Phase 2 only; superseded by Postgres, see above)
      ↓ read at build time
Next.js static export → GitHub Pages
```

There is no live backend server. The frontend never talks to SCOUTASTIC
and never sees the API key. In the target architecture, the sync script
upserts into Postgres (via a service_role key, never exposed to the
browser) and the frontend reads it at runtime through Supabase's REST API
under RLS — the same pattern already used for shortlists/notes, see
`docs/POSTGRES_PERSISTENCE.md`.

## What's confirmed against the real API

Everything in `scripts/lib/scoutasticClient.mjs` and
`scripts/lib/fieldMap.mjs` has been verified directly against real
responses — nothing is guessed:

- Base URL: `https://kvmechelen.scoutastic.com/api/v1`
- Auth: `Authorization: <api_key>` header (the raw key, **not** `Bearer <key>`)
- `GET /player?externalId=...` — one player, full detail.
- `GET /competitions/{id}/teams?gender=...` — returns a **full competition
  object** (name, area, `teams[]`, etc.), not a bare `{ teamIds }`. It also
  carries a flat `teamIds` array that matches `teams[].externalId` exactly
  — that's what `fetchCompetitionTeams()` returns.
- `GET /players?teamId=...&...` — a **Mongoose-paginate wrapper**
  (`{ docs, totalPages, page, hasNextPage, nextPage, ... }`), not a bare
  array. `fetchTeamPlayers()` walks every page (squads have stayed under
  one page of 100 in practice, but this doesn't assume that).

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
| `appearances`, `minutes`, `goals`, `assists` | `performanceSummary[latestSeasonYear]`, summed across every competition played that season | Requested via `performanceSummary=true`. `performanceHistory` (per-match detail) and `performanceData` are left `false` — not consumed yet. |

**Still `null` — no confirmed source:**

- `previousClub`, and any secondary position beyond the two SCOUTASTIC returns.

**Real player-id gotcha:** squad-crawl entries and the single-player
endpoint both use `transfermarktId`, not `externalId`, as the actual
unique id. Using `externalId` (as the very first pass here did, before
this was checked against real data) would leave every squad-crawled
player's id empty.

There is no documented "list all players" endpoint. "Import all players"
means "every player in every verified, configured competition" — crawled
via competitions → teams → squads — not literally every player
SCOUTASTIC has ever indexed.

## Competition coverage

`src/lib/scoutastic/config/competitions.json` was verified for real on
2026-08-30: **23 of 34 configured competitions resolve** (`verified:
true`); 11 don't (mostly Baltic states, Albania, Moldova, and a couple of
tier-2 leagues). The sync skips unverified competitions by default. Codes
can change between seasons — re-run `--list-competitions --update-config`
periodically.

## Running it

The API key is read **exclusively** from the `SCOUTASTIC_API_KEY`
environment variable. It is never written to a file by this script, never
printed, and never committed. Locally, set it as a real environment
variable in your own shell profile (a file outside this repo, e.g.
`~/.zshenv` for zsh — not `~/.zshrc`, which only loads for interactive
shells and won't be picked up by tooling that runs non-interactively).

```bash
# 1. Verify which configured competitions actually resolve
node scripts/sync-scoutastic.mjs --list-competitions
node scripts/sync-scoutastic.mjs --list-competitions --update-config   # persist verified:true/false

# 2. Spot-check one player or one team's raw response shape
node scripts/sync-scoutastic.mjs --inspect-player 1000674
node scripts/sync-scoutastic.mjs --inspect-team 501

# 3. Try a small real sync first (one verified competition, capped teams)
node scripts/sync-scoutastic.mjs --only NO1 --limit-teams 2 --dry-run

# 4. Full sync (writes data/players.json)
node scripts/sync-scoutastic.mjs
```

Useful flags: `--dry-run` (don't write the file), `--only NO1,SE1`
(restrict to specific competitionIds), `--include-unverified` (sync
competitions not yet marked verified — not recommended), `--delay-ms`,
`--retries`, `--gender` (default `male`), `--competitions-file` /
`--data-file` (point at alternate paths — used for offline testing, see
below).

## Production

`SCOUTASTIC_API_KEY` is set as a **GitHub Actions repository secret**
(Settings → Secrets and variables → Actions → New repository secret). The
`sync-scoutastic.yml` workflow reads it from there; it never appears in
any committed file. The schedule (default `05:00 UTC` daily) and manual
trigger both call the exact same script as above.

## Upsert / dedupe / deactivation logic

Players are matched by `scoutasticPlayerId` (SCOUTASTIC's
`transfermarktId`), the stable external id preserved on every record. On
each sync:

- **New** id → inserted, `createdAt` set.
- **Existing** id, fields changed → updated in place, `updatedAt` set,
  original `createdAt`/`addedDate` preserved.
- **Existing** id, fields identical → only `lastSyncedAt` refreshed
  (counted as "unchanged", not "updated").
- **Existing** id, not returned by this run — but *only* for a competition
  the sync actually finished crawling — → `active: false`. The record is
  never deleted, so history is preserved and a player who reappears next
  sync is reactivated automatically.

`getAllPlayers()` and friends (`src/lib/players-data/index.ts`) filter to
`active` players only.

## Offline testing

The sync logic (retry/backoff, pagination, upsert, change detection,
deactivation, failure isolation, missing/malformed field handling) was
verified against a local mock HTTP server before ever touching the real
API — see the git history for `scripts/lib/*.mjs` around the "Phase 2"
commits for the test harness used. `--competitions-file` / `--data-file`
plus `SCOUTASTIC_API_BASE_URL` pointed at `http://127.0.0.1:<port>` is the
pattern: nothing about the sync script is hardcoded to the real host.
