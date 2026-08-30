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

## ⚠️ Security tradeoff — read before going live

**This app has no login system.** The RLS policies in
`db/rls_policies.sql` currently grant the public `anon` role full
read/write on all three tables, because there's no authenticated user to
scope access to. In practice: **anyone who can reach the site's URL — or
who inspects the JS bundle and finds the anon key — can read and write
shortlists, scouting status, and scouting notes directly against the
database, bypassing the UI entirely.**

For a club's internal scouting opinions, that's worth a deliberate
decision, not a default. Options, roughly by effort:

1. **Put the whole site behind an access gate** (e.g. Cloudflare Access,
   or a similar edge auth layer in front of the GitHub Pages domain) —
   the RLS policies can stay as-is if only trusted people can reach the
   site at all.
2. **Add real user authentication** (Supabase Auth is built in) and scope
   RLS policies to `authenticated` users instead of `anon` — the more
   correct long-term fix, more work.
3. **Accept the current tradeoff for now** — reasonable if the URL isn't
   publicized and the data isn't highly sensitive, but should be a
   conscious choice.

Nothing here was implemented to force one of these — it's a product
decision, not an engineering one.

## Setup (one-time)

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
