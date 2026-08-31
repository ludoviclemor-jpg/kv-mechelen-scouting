# European Competitions

Browse SCOUTASTIC's competition catalog, filter/search it, and use it to
navigate the player database — `Competitions → Country → Competition →
Players`. SCOUTASTIC is the source of truth end to end here; SofaScore and
API-Football are never involved in competition data, only in per-player
ratings enrichment (see `docs/SOFASCORE_PROVIDER.md`) — kept strictly
separate, per explicit requirement.

## What's confirmed against the real API (2026-08-31)

`GET /competitions` (no id) — a bare, club-agnostic endpoint listing every
competition SCOUTASTIC knows about. Tested live: **2,439 total**, paginated
with the same Mongoose-paginate wrapper as `/players?teamId=` (`docs`,
`totalDocs`, `totalPages`, `page`, `hasNextPage`, `nextPage`).

Confirmed real per-competition fields (nothing below is guessed):

| Field | Confirmed example | Notes |
|---|---|---|
| `transfermarktId` | `"SEN2"`, `"PO1"` | The stable competition code — same id space already used everywhere else in this project as `competitionId` |
| `name` | `"Ligue 2"` | |
| `area` | `"Senegal"`, `"Iran"` | Country/region name — **no separate country id field exists** |
| `association` | `"AFC"`, `"CAF"`, `"UEFA"` | Confederation code — `association === "UEFA"` is how "European" is determined; this is the one thing SCOUTASTIC gives us to answer that, so it's the primary signal, not an invented list |
| `gender` | `"male"` | |
| `ageCategory` | `"Senior"` | |
| `isActive` | `true`/`false` | |
| `level` + `levelDefinition` | `2` + `"Second Tier"`; `14` + `"League Cup"`; `12` + `"Play-Offs"` | SCOUTASTIC's own combined tier/type label. Deliberately stored and shown verbatim — not split into a separate invented "type" taxonomy, since SCOUTASTIC itself doesn't draw that line |
| `imageUrl` / `imageUrlV2` | often `""` | Logo, when one exists — frequently doesn't; the UI must handle a missing logo gracefully, not assume one |
| `availableSeasons`, `season`, `startDate`, `endDate` | `["2024","2025","2026"]`, `2026` | Not populated on every competition — smaller/historical ones can lack season dates entirely |
| `teamIds` | flat array of team external ids | **Included inline** — a competition's team list costs nothing extra to discover; see below |

No `countryId` exists (only the `area` name). No separate "type" field
independent of `levelDefinition`.

## Why this is cheap: teams come free

Because `teamIds` is inline on every competition object, discovering
**every competition and every competition's team list** costs about
**25 requests total** (`totalDocs: 2439` at `limit=100` → `totalPages: 25`)
— not one request per competition. This is a meaningfully better number
than earlier estimates in `docs/SCOUTASTIC_SYNC.md`, which assumed a
separate `/competitions/{id}/teams` call per competition (~725 requests
for the senior-competition subset) — that assumption predates this
endpoint being tested for real.

**Real numbers from a full live run (`--dry-run`, 2026-08-31, 13.6s total):**

| | Count |
|---|---|
| Competitions fetched (worldwide) | 2,439 |
| Skipped (no `transfermarktId`) | 4 |
| `association = "UEFA"` ("European") | 1,350 |
| European + active | 596 |
| **European + active + `ageCategory: "Senior"` + `gender: "male"`** | **499** |
| Competition-team links (all 1,350 European competitions) | 17,873 |

The raw European set (1,350) is mostly **not** what a scout wants by
default — it includes youth leagues (confirmed real example:
`"Championnat National U17 - Groupe F"`, `ageCategory: "U17"`,
`levelDefinition: "Youth league"`) mixed in alongside senior men's
football. `fetchCompetitions()` (`src/lib/competitions-data/remote.ts`)
therefore filters to `age_category = 'Senior'` **and** `gender = 'male'`
by default (`seniorMenOnly`, overridable) — **499** is the real number the
Competitions page shows by default, not 1,350 or 2,439.

Squad-level player data is unchanged from the existing pattern:
`GET /players?teamId=...` per team, one request per team, spread across
scheduled runs via the existing `scoutastic_teams` crawl queue (see
`docs/SCOUTASTIC_SYNC.md`).

## Architecture

```
GET /competitions (SCOUTASTIC)
      ↓ scripts/sync-competitions.mjs (service_role key — never in the browser)
scoutastic_competitions, competition_teams   (Postgres)
      ↓ read at runtime, authenticated-only (db/rls_policies.sql)
/competitions, /competition?id=...           (Client Components — src/lib/competitions-data/)
```

`scripts/sync-competitions.mjs` is deliberately **not** batched/resumable
the way the player-squad crawl is — the whole discovery is cheap enough
(~25 requests) to do in full on every run. It upserts:

- `scoutastic_competitions` — one row per competition, including
  `is_european` (computed from `association = 'UEFA'` at sync time, so
  filtering to Europe is a plain indexed column lookup, not a per-request
  API filter).
- `competition_teams` — a proper many-to-many junction (`competition_id`,
  `team_id`). A real club can play in a domestic league AND a domestic cup
  AND a continental competition in the same season — a single
  competition-per-team column can't represent that; this can.
- `scoutastic_teams` — newly-discovered team ids are queued here (if not
  already present) for the existing resumable squad crawl to pick up.

## Player ↔ competition relationship

`players.competition_id` (already existed, from the earlier player-data
rework) is the soft reference — set to whichever competition's team-crawl
context a player was discovered through, same convention as every other
player field that isn't a hard foreign key (see `db/schema.sql`'s header).
The Competition detail page's player list
(`fetchPlayersPage({ competitionId: ... })`, `src/lib/players-data/remote.ts`)
reuses the exact same server-side search/filter/pagination the Players
page already has — no duplicated player-query logic, per explicit
requirement.

## Country/Europe filter

`association === 'UEFA'` is SCOUTASTIC's own signal and the primary
filter — not a hardcoded country list. `easternEuropeanCountries.json`
(used for African Debutants) remains separate and unrelated; if a
narrower or different European country set is ever needed for some other
purpose, the same externalized-JSON-config pattern already used there is
the place to add it — not a UI-level hardcoded list.

## Verified

- `node scripts/sync-competitions.mjs --dry-run` — run for real against
  the live API (2026-08-31): fetched all 2,439 competitions across 25
  pages in 13.6s, mapped and filtered correctly (see the real numbers
  table above), zero errors.

## Not yet done

- `scripts/sync-competitions.mjs` needs `SUPABASE_SERVICE_ROLE_KEY` as a
  GitHub Actions repository secret before `.github/workflows/sync-competitions.yml`
  or a real (non-`--dry-run`) local run can actually write anything to
  Postgres (same credential the still-pending player-sync Postgres
  migration will also need — see `docs/SCOUTASTIC_SYNC.md`). Until that
  secret exists, `scoutastic_competitions`/`competition_teams` stay empty
  and the Competitions page shows its empty state.
- Team **names** aren't fetched during discovery (only ids) — `GET
  /competitions` doesn't include them, and fetching each competition's full
  team list separately would reintroduce the per-competition request cost
  this design avoids. Team names become available once a team's squad is
  actually crawled (`scoutastic_teams.name`) — not fabricated in the
  meantime, left `null`.
