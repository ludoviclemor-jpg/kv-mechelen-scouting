# Persistence architecture (Phase 3, extended 2026-08 to cover players too)

Real, shared, durable storage — originally just shortlists, scouting
status, and scouting notes (the things a scout actually writes), extended
to the player catalog itself once it outgrew a committed
`data/players.json` file (see `docs/SCOUTASTIC_SYNC.md` for why — in
short, hundreds of thousands of players discovered via SCOUTASTIC's
`GET /competitions`). Player and rating data stay read-only from the
frontend's side either way — only the sync scripts (service_role, bypasses
RLS) write to `players`/`sync_meta`; the frontend only ever reads them.

## Why not just a database connection string

The frontend is a static GitHub Pages export with no server. A raw
Postgres connection string (with a password) can never be shipped to the
browser — that's the same class of problem as the SCOUTASTIC API key.
**Supabase** solves this: Postgres + an auto-generated REST API, secured
by **Row Level Security** policies enforced by the database itself. The
frontend calls that API directly with a public "anon" key — safe to
expose, because the RLS policies (not the key's secrecy) decide what it
can do. No custom backend to write or host.

```
Browser (static GitHub Pages site)
      ↓ NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (public, safe)
Supabase's auto-generated REST API
      ↓ enforced by
Row Level Security policies (db/rls_policies.sql)
      ↓
Postgres (db/schema.sql: shortlists, shortlist_players, player_scouting_state)
```

Not configured → the app falls back to **local-only** persistence
(in-memory, resets on reload) — exactly the original Phase 1/2 behavior.
Nothing breaks either way; see `src/lib/persistence/`.

## Access control — resolved via authentication

`db/rls_policies.sql` grants read/write on `shortlists`/`shortlist_players`/
`player_scouting_state` to Supabase's `authenticated` role, and **read-only**
on `players`/`sync_meta` (writes there come only from the sync scripts'
service_role key, which never reaches the browser). `anon` gets nothing on
any table, so an unauthenticated request is rejected by Postgres itself.
See `docs/AUTHENTICATION.md` for the full authentication architecture
(client-side Supabase Auth, `/login`, session persistence) — as of the
player-data rework, this now protects the entire dataset unconditionally,
including the player catalog itself (previously a static-exported gap;
see that doc's "Update" note).

## Setup (one-time)

See `docs/AUTHENTICATION.md` too — user accounts need to exist before
sign-in works at all; this section only covers the database side.

**If a Supabase project is already connected** (this project's is): the
player-data rework added new tables/views (`players`, `sync_meta`,
`scoutastic_competitions`, `scoutastic_teams`, the `player_*` filter
views) and a new policy — **re-run the current `db/schema.sql` and
`db/rls_policies.sql`** in that project's SQL Editor. Both are written
with `create table if not exists` / `create or replace view` / `create
policy` guarded appropriately, so re-running them is safe and won't touch
the existing `shortlists`/`player_scouting_state` data.

1. Create a free Supabase project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run `db/schema.sql`, then `db/rls_policies.sql`.
3. Project Settings → API: copy the **Project URL** and the **anon
   public** key (not the `service_role` key — that one must never be
   exposed).
4. These are safe to hand over directly (not a secret needing the same
   careful handling as `SCOUTASTIC_API_KEY`):
   - Locally: put them in `.env.local` (already gitignored) for
     `npm run dev`.
   - Production: **GitHub repository variables** (Settings → Secrets and
     variables → Actions → **Variables** tab, not Secrets — they're
     public by design), named `NEXT_PUBLIC_SUPABASE_URL` and
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `deploy.yml` already reads them.
5. Push — the next build picks them up automatically. Settings → Database
   in the app will show "Connected" once it's live.

## What's already built

- `db/schema.sql` — `players`, `sync_meta`, `scoutastic_competitions` +
  `competition_teams` (the Competitions feature's data, see
  `docs/COMPETITIONS.md`), `scoutastic_teams` (crawl-queue cache, see
  `docs/SCOUTASTIC_SYNC.md`), `shortlists`, `shortlist_players`,
  `player_scouting_state`, plus the `player_nationalities`/`player_leagues`/
  `player_clubs`/`competition_countries` views that back the Players and
  Competitions pages' filter dropdowns. Standard Postgres, works on any
  host.
- `db/rls_policies.sql` — Supabase-shaped policies (see the caveat above).
- `src/lib/persistence/` — `PersistenceProvider` interface,
  `LocalOnlyProvider` (today's default for shortlists/notes when Supabase
  isn't configured), `SupabaseProvider` (real, activates automatically
  once configured). Player data has no local-only fallback — it only
  ever lives in Postgres now (`src/lib/players-data/remote.ts`); an
  unconfigured Supabase project means an empty player database, not
  fictitious data.
- `src/lib/app-store.tsx` — unchanged public API
  (`useAppStore`/`useEffectiveStatus`/`useEffectiveNotes`); loads all
  shortlists/status/notes once in bulk on mount, writes optimistically
  and persists in the background. No component outside this file knows
  or cares which provider is active.
- `src/lib/players-data/remote.ts` — every player-data read the frontend
  does now: single-player lookup, bounded by-id lookups (shortlists,
  reports), live search, and real server-side search/filter/sort/pagination
  for the Players list. Nothing here ever pulls the whole `players` table
  into the browser — see that file's own comments for each function's
  bound.
