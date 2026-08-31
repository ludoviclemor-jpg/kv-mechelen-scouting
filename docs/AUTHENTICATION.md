# Authentication

Client-side Supabase Auth — no Next.js server involved, because GitHub
Pages doesn't run one. Uses the same `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` pair as persistence (`docs/POSTGRES_PERSISTENCE.md`)
— Auth is part of the same Supabase project, no extra credentials.

## Read this before assuming anything is "protected"

**GitHub Pages has no server, so nothing here can stop a request before
it's served.** This is a hard ceiling of static hosting, confirmed by how
the site actually works, not a gap in this implementation:

- `RequireAuth` (`src/components/auth/RequireAuth.tsx`) redirects an
  unauthenticated visitor to `/login` the instant a protected page's JS
  runs, and renders nothing until auth state is confirmed. This reliably
  keeps the **app experience** — its data fetches, its navigation — behind
  login.
- It does **not** make the underlying static HTML file private. A request
  that never runs JS (`curl`, "View Source", a crawler) still gets `200`
  with the fully pre-rendered page. There is no way to change this without
  either putting the whole site behind an edge auth layer (e.g. Cloudflare
  Access in front of the GitHub Pages domain) or moving off static hosting
  entirely.

**Update (player-data architecture rework, 2026-08):** the gap described
below — the Dashboard and Player Profile pages leaking real data into the
raw static HTML — is now **closed**, as a side effect of a bigger change,
not a fix aimed at this document. Once the player catalog moved to
Postgres (`db/schema.sql`, see `docs/SCOUTASTIC_SYNC.md`), every route
that reads player data had to become a Client Component regardless —
there's no server at request time on GitHub Pages, and a build-time
Server Component fetch would just bake in a stale snapshot from whenever
the site was last built, not live data. So Dashboard (`/`) and Player
Profile (`/player?id=...`) are `"use client"` now, exactly like every
other route, and `players`/`sync_meta` carry the same `authenticated`-only
RLS policy as shortlists/notes (`db/rls_policies.sql`). The table below is
kept for history; every row is now "No".

**What's genuinely, unconditionally protected:** the entire player
database, plus shortlists and scouting notes/status — all of it lives in
Postgres and is only ever fetched at runtime through Supabase, so an
unauthenticated request is rejected by Postgres Row Level Security itself
(`db/rls_policies.sql`), regardless of what the frontend does or doesn't
check. There is no committed player data file anymore for a `curl`/View
Source request to find.

**Historical gap (closed — see above):** `RequireAuth` hides everything
behind a login screen for anyone using the app normally — verified
directly, the *visible* pre-rendered HTML for every `(app)` route shows
only the "Redirecting to login…" placeholder, never real content. Before
the Postgres rework, whether a given route's data was *also* present in
the raw HTML bytes (unrendered, but fetchable by `curl`/"View Source")
depended on whether that page was a Server or Client Component:

| Route | Component type (as of 2026-08) | Real data in raw HTML bytes? |
|---|---|---|
| Dashboard (`/`) | Client | **No** |
| Player profile (`/player?id=...`) | Client | **No** |
| Competitions (`/competitions`), Competition detail (`/competition?id=...`) | Client | **No** — added with the Competitions feature (`docs/COMPETITIONS.md`), same query-string-route/Client-Component pattern as the player profile, for the same reason |
| Players list, Debutants, Top Performers, Shortlists, Reports, Settings | Client | **No** |

Scouting notes/status are unaffected regardless of route — always fetched
client-side through `useAppStore` (Supabase), confirmed by grepping the
built Reports page for note content and finding none.

## Architecture

```
src/lib/supabaseClient.ts        <- one shared Supabase client (auth + persistence)
src/lib/auth/AuthProvider.tsx    <- session state, signIn/signOut, React context
src/components/auth/RequireAuth.tsx  <- the redirect-to-/login guard

src/app/layout.tsx               <- root: just <AuthProvider> + globals.css
src/app/login/page.tsx           <- outside the (app) group — no sidebar, no guard
src/app/(app)/layout.tsx         <- wraps every other route: RequireAuth ->
                                     AppStoreProvider -> AppShell
src/app/(app)/*                  <- dashboard, players, debutants,
                                     top-performers, shortlists, reports,
                                     settings (all protected identically)
```

Route groups (the `(app)` folder) are a Next.js convention: the
parentheses are invisible in the URL — `(app)/players/page.tsx` is still
served at `/players`. It exists purely so this one folder can carry a
different layout (auth-gated, with the sidebar) than `/login` (not
gated, no sidebar).

## Session persistence (why a refresh doesn't log you out)

The Supabase JS client persists the session to `localStorage` and
auto-refreshes the token — configured explicitly in
`src/lib/supabaseClient.ts` (`persistSession: true`,
`autoRefreshToken: true`). Because this is a multi-page static site (each
route is a separate HTML file, not one long-lived SPA session), a hard
navigation re-runs the whole JS bundle on every page — `AuthProvider`
re-reads the persisted session from `localStorage` on mount each time,
which is what makes both a plain refresh and navigating between the
site's separate static pages feel like one continuous session.

## No fake login, no hardcoded credentials

There is no bespoke username/password check anywhere in this codebase —
every credential check is delegated to Supabase Auth
(`signInWithPassword`). There is also no self-service sign-up UI: this is
an internal tool, so accounts are created by an administrator directly in
the Supabase dashboard (Authentication → Users → Add user / Invite),
never through the app itself.

## Setup (once Supabase is connected — not done yet)

1. In the Supabase dashboard: Authentication → Providers → ensure
   Email is enabled. Authentication → Users → add each scout's account
   (email + a password they'll change, or use "Invite" for a magic-link
   first login).
2. Run `db/schema.sql` then `db/rls_policies.sql` (the updated,
   `authenticated`-only version) in the SQL Editor.
3. Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` as
   GitHub repository **variables** (not secrets — see
   `docs/POSTGRES_PERSISTENCE.md`).

## Verification checklist (what was actually run, not just written)

- [x] `npm run lint` — clean
- [x] `npm run build` (both local and `GITHUB_ACTIONS=true`) — clean,
      all 8,465 pages generate (8,454 players + the rest of the app,
      `/login` included)
- [x] `out/index.html` (and every other `(app)` route) *visually*
      pre-renders only the "Redirecting to login…" placeholder — grepped
      directly for real page content (e.g. "Total Players") vs. the
      redirect string.
- [x] Same file also still contains the dashboard's real data, but only
      inside the embedded RSC hydration payload, not the visible HTML —
      see the limitation section above for exactly what this does and
      doesn't mean.
- [x] `out/reports/index.html` grepped for note content (`recommendation`
      text) — none present, confirming notes stay client-fetched-only,
      unlike the SCOUTASTIC-sourced fields.
- [x] `/login`'s HTML has the KV Mechelen crest but no sidebar/nav —
      grepped for "Dashboard" nav text, found none.
- [x] No secret ever appears in `out/`: grepped the built client bundle
      for `SCOUTASTIC_API_KEY=<value>`, `SOFASCORE_API_KEY`,
      `service_role`, and any `postgres://user:pass@` pattern — none
      found (only this file's own documentation text, which names
      variables, never values).
- [x] `db/rls_policies.sql` reviewed line-by-line: no policy targets
      `anon` on any of the three tables, and RLS is enabled on all three
      — Postgres denies by default with RLS on and no matching policy,
      so this is enough to reason about correctness even without a live
      database to test against.
- [x] Live sign-in / sign-out against a real Supabase project — verified
      working end-to-end by the user against the connected project
      (login, logout, refresh-persistence, direct-URL-redirect all
      confirmed).

**2026-08-30/31 (player-data architecture rework):** the checklist above
predates both the real Supabase connection and the move of `players` into
Postgres — its page-count and "RSC payload still has real data" entries
are now stale (see the Update note near the top of this file) and its
`npm run lint`/`npm run build` runs are from before this rework's changes.
This session's sandboxed shell had no Node.js available, so those two
commands could not be re-run here — **run `npm run lint` and
`npm run build` locally before deploying** and treat this checklist as
unverified for everything touched by the rework until then.
