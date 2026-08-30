# KV Mechelen Scouting Hub

Internal football scouting and recruitment dashboard for KV Mechelen.

**Live:** https://ludoviclemor-jpg.github.io/kv-mechelen-scouting/

## Status

Phase 2 — real player data from SCOUTASTIC. No fictitious/demo players
remain; the frontend reads only from `data/players.json`, synced by
`scripts/sync-scoutastic.mjs` (locally or via GitHub Actions). See
[docs/SCOUTASTIC_SYNC.md](docs/SCOUTASTIC_SYNC.md) for the full
architecture, what's confirmed vs. still unverified against the real API,
and how to run/trigger a sync.

Planned phases:

1. **Frontend** — Next.js UI, static export, GitHub Pages deployment. ✅
2. **SCOUTASTIC** — player, competition and club data. ✅ (this phase)
3. **PostgreSQL** — persistence for shortlists, scouting status and notes.
4. **SofaScore** — live match ratings, debut detection.
5. **Daily synchronization** — automated via GitHub Actions cron. ✅ (built in Phase 2)
6. **Production backend** — secure API layer connecting the above.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Recharts (rating trend charts)
- lucide-react (icons)
- Plain Node.js (`scripts/`) for the SCOUTASTIC sync — no extra runtime/deps

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Building for GitHub Pages

```bash
npm run build
```

`next.config.ts` applies the `/kv-mechelen-scouting` base path automatically
when `GITHUB_ACTIONS=true` (set by the deploy workflow), and outputs a
static site to `out/`. Locally, `npm run build` runs without the base path
so `out/` can be previewed at the domain root.

Deployment is automated via `.github/workflows/deploy.yml` on every push
to `main`, and is also triggered directly by a successful SCOUTASTIC sync
(`.github/workflows/sync-scoutastic.yml`).

## Syncing real player data

```bash
SCOUTASTIC_API_KEY=... node scripts/sync-scoutastic.mjs --list-competitions
SCOUTASTIC_API_KEY=... node scripts/sync-scoutastic.mjs
```

Full details, including what's verified against the real API vs. still a
draft: [docs/SCOUTASTIC_SYNC.md](docs/SCOUTASTIC_SYNC.md). The key is read
only from the `SCOUTASTIC_API_KEY` environment variable — locally that
means your own shell, in production a GitHub Actions repository secret.
It is never committed, never written to a file, never printed, and never
shipped to the browser.

## Project structure

```
src/
  app/                  routes (App Router)
  components/
    layout/             Sidebar, PageHeader, AppShell, ClubCrest
    ui/                 StatCard, RatingBadge, StatusBadge, SyncStatusBanner, ...
    players/             PlayerCard, PlayerTable, DebutantTable, RecentlyAddedTable
    player-profile/      PlayerHeader, LastMatchesTable, ScoutingNotesCard
    shortlists/          ShortlistCard, ShortlistButton
  lib/
    players-data/        typed Player/Shortlist schema + selectors (reads data/players.json)
    scoutastic/config/    competitions, position map, nationality lists (shared with scripts/)
    app-store.tsx         in-memory shortlist/status/notes state (frontend-only until Phase 3)
scripts/
  sync-scoutastic.mjs     the SCOUTASTIC sync entrypoint (CLI + CI)
  lib/                    API client + field mapper (see docs/SCOUTASTIC_SYNC.md)
data/
  players.json            synced player data, committed to the repo
```
