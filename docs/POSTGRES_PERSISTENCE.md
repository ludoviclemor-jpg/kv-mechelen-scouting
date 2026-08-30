# Persistence architecture (Phase 3)

Real, shared, durable storage for shortlists, scouting status, and
scouting notes — the things a scout actually writes. Player and rating
data stay read-only, synced by CI into `data/players.json` (see
`docs/SCOUTASTIC_SYNC.md`, `docs/SOFASCORE_PROVIDER.md`); this system
never touches that.

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

`db/rls_policies.sql` now grants read/write on all three tables only to
Supabase's `authenticated` role — `anon` gets nothing, so an
unauthenticated request is rejected by Postgres itself. See
`docs/AUTHENTICATION.md` for the full authentication architecture
(client-side Supabase Auth, `/login`, session persistence) and — just as
important — its documented limits: this protects Postgres-backed data
unconditionally, but not the separately-synced player database, which is
static-exported and therefore fetchable by direct URL regardless of
login state.

## Setup (one-time)

See `docs/AUTHENTICATION.md` too — user accounts need to exist before
sign-in works at all; this section only covers the database side.

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

- `db/schema.sql` — `shortlists`, `shortlist_players`,
  `player_scouting_state`. Standard Postgres, works on any host.
- `db/rls_policies.sql` — Supabase-shaped policies (see the caveat above).
- `src/lib/persistence/` — `PersistenceProvider` interface,
  `LocalOnlyProvider` (today's default), `SupabaseProvider` (real,
  activates automatically once configured).
- `src/lib/app-store.tsx` — unchanged public API
  (`useAppStore`/`useEffectiveStatus`/`useEffectiveNotes`); loads all
  shortlists/status/notes once in bulk on mount, writes optimistically
  and persists in the background. No component outside this file knows
  or cares which provider is active.
