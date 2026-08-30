# KV Mechelen Scouting Hub

Internal football scouting and recruitment dashboard for KV Mechelen.

**Live:** https://ludoviclemor-jpg.github.io/kv-mechelen-scouting/

## Status

Real player data from SCOUTASTIC (8,454 players, 23 competitions) — no
fictitious/demo data remains. Authentication and Postgres persistence
architecture are built (client-side Supabase Auth + Row Level Security)
but **not yet connected to a real Supabase project** — the app currently
runs with local-only (in-memory) shortlists/notes and no login enforced
in practice, both of which activate automatically once
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. See:

- [docs/SCOUTASTIC_SYNC.md](docs/SCOUTASTIC_SYNC.md) — player data sync
- [docs/SOFASCORE_PROVIDER.md](docs/SOFASCORE_PROVIDER.md) — ratings (no live provider yet — no legitimate API exists, see the doc)
- [docs/POSTGRES_PERSISTENCE.md](docs/POSTGRES_PERSISTENCE.md) — shortlists/notes persistence
- [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) — login, sessions, and **what static hosting can and can't actually protect**

Planned phases:

1. **Frontend** — Next.js UI, static export, GitHub Pages deployment. ✅
2. **SCOUTASTIC** — player, competition and club data. ✅
3. **PostgreSQL** — persistence for shortlists, scouting status and notes. Architecture built, not connected.
4. **SofaScore** — live match ratings, debut detection. Architecture built; no legitimate data source found yet.
5. **Daily synchronization** — automated via GitHub Actions cron. ✅
6. **Production backend** — secure API layer connecting the above.
7. **Authentication** — Supabase Auth, client-side, GitHub Pages-compatible. Architecture built, not connected.

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
  app/
    login/                standalone login route (no sidebar, not auth-gated)
    (app)/                everything else — dashboard, players, debutants,
                           top-performers, shortlists, reports, settings.
                           Same URLs as before (route groups are invisible
                           in the URL); this folder's layout.tsx is what
                           applies RequireAuth + the sidebar.
  components/
    auth/                 RequireAuth (the redirect-to-/login guard)
    layout/                Sidebar, PageHeader, AppShell, ClubCrest
    ui/                    StatCard, RatingBadge, StatusBadge, SyncStatusBanner, ...
    players/               PlayerCard, PlayerTable, DebutantTable, RecentlyAddedTable
    player-profile/        PlayerHeader, LastMatchesTable, ScoutingNotesCard
    shortlists/             ShortlistCard, ShortlistButton
  lib/
    players-data/          typed Player/Shortlist schema + selectors (reads data/players.json)
    scoutastic/config/     competitions, position map, nationality lists (shared with scripts/)
    sofascore/              (reserved for a future real SofaScore provider's shared config)
    auth/AuthProvider.tsx   Supabase Auth session state, signIn/signOut
    persistence/            PersistenceProvider (LocalOnlyProvider / SupabaseProvider)
    supabaseClient.ts       one shared Supabase client (auth + persistence)
    app-store.tsx           shortlist/status/notes state, backed by persistence/
scripts/
  sync-scoutastic.mjs      the SCOUTASTIC sync entrypoint (CLI + CI)
  sync-sofascore.mjs        SofaScore enrichment sync — no-op until a provider exists
  lib/                      API clients + field mappers + matching logic
data/
  players.json             synced player data, committed to the repo
db/
  schema.sql                Postgres schema (shortlists, notes/status)
  rls_policies.sql           Row Level Security — authenticated-only
```
