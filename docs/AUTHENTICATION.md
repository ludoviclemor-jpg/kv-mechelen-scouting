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

**What's genuinely, unconditionally protected:** shortlists and scouting
notes/status, because they live in Postgres and are only ever fetched at
runtime through Supabase — an unauthenticated request is rejected by
Postgres Row Level Security itself (`db/rls_policies.sql`), regardless of
what the frontend does or doesn't check.

**What's UI-gated only, by deliberate scope decision:** the player
database (`data/players.json` — SCOUTASTIC names, clubs, market values,
contracts) is baked into static output at `next build` time, before any
concept of "who's asking" exists. `RequireAuth` hides it behind a login
screen for anyone using the app normally — verified directly: the
*visible* pre-rendered HTML for every `(app)` route shows only the
"Redirecting to login…" placeholder, not real content. But every page in
`(app)/` whose data comes from a plain Server Component (Dashboard,
Players, Reports, Debutants, Top Performers — i.e. every page except the
notes/shortlists that go through `useAppStore`) still gets its full
server-rendered output embedded in that same HTML response as a React
Server Components "flight data" payload, used for hydration — present in
the raw bytes regardless of what's visually rendered, and regardless of
`RequireAuth`. Confirmed directly: `grep`-ing the built `out/index.html`
finds the dashboard's real stat-card data serialized in exactly this way,
even though the page visually shows the login redirect. Scouting
notes/status are *not* affected — those are fetched client-side through
`useAppStore` (Supabase), confirmed by grepping the built Reports page
for note content and finding none. Closing the SCOUTASTIC-data gap for
real means moving player data out of build-time Server Components into
an authenticated runtime fetch (a materially bigger change — this is the
same tradeoff already decided in favor of the simpler approach; don't
assume it's been done without checking).

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
- [ ] Live sign-in / sign-out against a real Supabase project — **cannot
      be verified yet**, no project is connected (by explicit
      instruction). Re-run this check once one is.
