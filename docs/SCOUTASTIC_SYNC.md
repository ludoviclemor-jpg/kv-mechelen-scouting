# SCOUTASTIC sync

How real player data gets from SCOUTASTIC into this dashboard, and — just
as important — what's actually confirmed vs. still a best-effort guess.

## Architecture

```
SCOUTASTIC API
      ↓ (SCOUTASTIC_API_KEY — GitHub Actions repository secret, server-side only)
scripts/sync-scoutastic.mjs   (.github/workflows/sync-scoutastic.yml)
      ↓ upserts
data/players.json             (committed to the repo)
      ↓ read at build time
Next.js static export → GitHub Pages
```

There is no live backend server. The frontend never talks to SCOUTASTIC
and never sees the API key — it only ever reads the already-synced
`data/players.json`, which is baked into the static HTML at build time.
A successful sync commits new data and explicitly triggers the Pages
deploy workflow (a commit made with the default `GITHUB_TOKEN` doesn't
auto-trigger other workflows, so `sync-scoutastic.yml` dispatches
`deploy.yml` itself once it has pushed a change).

## What's confirmed vs. unverified

Everything in `scripts/lib/scoutasticClient.mjs` and
`scripts/lib/fieldMap.mjs` is confirmed against real API responses from a
prior verification pass — nothing there is guessed:

- Base URL: `https://{subdomain}.scoutastic.com/api/v1`
- Auth: `Authorization: <api_key>` header (the raw key, **not** `Bearer <key>`)
- `GET /player?externalId=...` — full player detail. Field mapping verified
  against a real response (`firstName`, `lastName`, `dateOfBirth`, `height`,
  `foot`, `agent`, `nationality`, `secondNationality`, `mainPosition`,
  `contractExpires`, `marketValue`, `teams[]`).
- `GET /competitions/{id}/teams` → `{ teamIds: [...] }`
- `GET /players?teamId=...` → that team's squad (same player field shape)

**Not confirmed — deliberately left `null`, never guessed:**

- `photoUrl`, `previousClub`, `secondaryPositions` — not present in any
  confirmed response.
- `appearances`, `minutes`, `goals`, `assists` — the API has
  `performanceData`/`performanceSummary`/`performanceHistory` params that
  might return these, but every confirmed call so far sets them to
  `"false"`. Use `node scripts/sync-scoutastic.mjs --inspect-player <id>`
  with those flipped to `"true"` (edit `fetchPlayer` in
  `scoutasticClient.mjs`) to find out, then extend `fieldMap.mjs`.
- 33 of the 34 entries in `src/lib/scoutastic/config/competitions.json` —
  only `NO1` (Norway tier 1) is marked `"verified": true`. **Run
  `--list-competitions` before trusting any others**; the sync skips
  unverified competitions by default.

There is no documented "list all players" endpoint. "Import all players"
means "every player in every competition we've verified and configured" —
crawled via competitions → teams → squads — not literally every player
SCOUTASTIC has ever indexed.

## Running it

The API key is read **exclusively** from the `SCOUTASTIC_API_KEY`
environment variable. It is never written to a file by this script, never
printed, and never committed.

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
`--retries`, `--gender` (default `male`).

## Production

`SCOUTASTIC_API_KEY` is set as a **GitHub Actions repository secret**
(Settings → Secrets and variables → Actions → New repository secret). The
`sync-scoutastic.yml` workflow reads it from there; it never appears in
any committed file. The schedule (default `05:00 UTC` daily) and manual
trigger both call the exact same script as above.

## Upsert / dedupe / deactivation logic

Players are matched by `scoutasticPlayerId` (the SCOUTASTIC/TransferMarkt
`externalId`), which is the stable external id preserved on every record.
On each sync:

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
