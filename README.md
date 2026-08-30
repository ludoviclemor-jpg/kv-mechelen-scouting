# KV Mechelen Scouting Hub

Internal football scouting and recruitment dashboard for KV Mechelen.

**Live:** https://ludoviclemor-jpg.github.io/kv-mechelen-scouting/

## Status

Phase 1 — frontend architecture and UI, backed by a demo data layer.
Everything currently on screen is placeholder scouting data used to
validate the interface end-to-end.

Planned phases:

1. **Frontend** (this repo, current) — Next.js UI, static export, GitHub Pages deployment.
2. **SCOUTASTIC** — player, competition and club data.
3. **PostgreSQL** — persistence for shortlists, scouting status and notes.
4. **SofaScore** — live match ratings.
5. **Daily synchronization** — automated data refresh.
6. **Production backend** — secure API layer connecting the above.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Recharts (rating trend charts)
- lucide-react (icons)

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
to `main`.

## Project structure

```
src/
  app/                  routes (App Router)
  components/
    layout/             Sidebar, PageHeader, AppShell, ClubCrest
    ui/                 StatCard, RatingBadge, StatusBadge, DataTable atoms, ...
    players/            PlayerCard, PlayerTable, DebutantTable, RecentlyAddedTable
    player-profile/      PlayerHeader, LastMatchesTable, ScoutingNotesCard
    shortlists/         ShortlistCard, ShortlistButton
  lib/
    demo-data/          typed demo dataset + selectors (the seam future APIs plug into)
    app-store.tsx       in-memory shortlist/status/notes state (frontend-only until Phase 3)
```

See `src/lib/demo-data/players.ts` for the data-layer contract that
SCOUTASTIC, SofaScore and PostgreSQL will fill in later phases.
