-- Row Level Security policies — Supabase-shaped (uses Supabase's built-in
-- `authenticated` role, granted automatically to any request carrying a
-- valid session JWT from a signed-in user). Run after schema.sql.
--
-- Deliberately grants NOTHING to `anon` — RLS denies by default when a
-- table has it enabled and no policy matches the requesting role, so an
-- unauthenticated request is rejected by Postgres itself, not by
-- frontend code. See docs/AUTHENTICATION.md.
--
-- `players` is genuinely, unconditionally protected this way now that it
-- lives here — this closes the RSC-payload gap that existed when player
-- data was baked into static build output (see docs/AUTHENTICATION.md's
-- history). It's read-only for `authenticated` — writes come only from
-- the sync script's service_role key (bypasses RLS by design; that key
-- never reaches the browser, see docs/SCOUTASTIC_SYNC.md).
--
-- Every authenticated user gets the same access (no per-user ownership
-- model) — this is an internal club tool where any signed-in scout is
-- trusted with all shortlists/notes/player data, not a multi-tenant app.
--
-- Every `create policy` below is preceded by `drop policy if exists` —
-- unlike `create table`/`create view`, Postgres has no
-- `create policy if not exists`, so this file is only safe to re-run
-- against an already-set-up project (see docs/POSTGRES_PERSISTENCE.md)
-- because of that pairing. Don't drop the pairing when adding a policy.

alter table players enable row level security;
alter table sync_meta enable row level security;
alter table scoutastic_competitions enable row level security;
alter table competition_teams enable row level security;
alter table scoutastic_teams enable row level security;
alter table matches enable row level security;
alter table shortlists enable row level security;
alter table shortlist_players enable row level security;
alter table player_scouting_state enable row level security;

drop policy if exists "authenticated can read players" on players;
create policy "authenticated can read players" on players
  for select to authenticated using (true);
-- No insert/update/delete policy for players — the frontend never
-- writes to this table; only the sync script (service_role, bypasses
-- RLS) does.

drop policy if exists "authenticated can read sync_meta" on sync_meta;
create policy "authenticated can read sync_meta" on sync_meta
  for select to authenticated using (true);
-- Also written only by the sync script's service_role key.

drop policy if exists "authenticated can read scoutastic_competitions" on scoutastic_competitions;
create policy "authenticated can read scoutastic_competitions" on scoutastic_competitions
  for select to authenticated using (true);
drop policy if exists "authenticated can read competition_teams" on competition_teams;
create policy "authenticated can read competition_teams" on competition_teams
  for select to authenticated using (true);
-- scoutastic_teams is an internal crawl-queue cache, never read by the
-- frontend directly — RLS is still enabled (no table should be left
-- unrestricted), just with no policy at all, which denies every role
-- including authenticated. Only the sync script (service_role) touches it.

drop policy if exists "authenticated can read matches" on matches;
create policy "authenticated can read matches" on matches
  for select to authenticated using (true);
-- Also written only by the sync script's service_role key.

alter table player_international_callups enable row level security;
drop policy if exists "authenticated can read player_international_callups" on player_international_callups;
create policy "authenticated can read player_international_callups" on player_international_callups
  for select to authenticated using (true);
-- Also written only by scripts/sync-international-callups.mjs's service_role key.

-- player_nationalities / player_leagues / player_clubs are plain views
-- (security_invoker = true, see schema.sql) — they carry no policies of
-- their own and never need any; they're exactly as readable as `players`
-- already is for whichever role queries them.

drop policy if exists "authenticated can read shortlists" on shortlists;
create policy "authenticated can read shortlists" on shortlists
  for select to authenticated using (true);
drop policy if exists "authenticated can write shortlists" on shortlists;
create policy "authenticated can write shortlists" on shortlists
  for insert to authenticated with check (true);
drop policy if exists "authenticated can update shortlists" on shortlists;
create policy "authenticated can update shortlists" on shortlists
  for update to authenticated using (true) with check (true);
drop policy if exists "authenticated can delete shortlists" on shortlists;
create policy "authenticated can delete shortlists" on shortlists
  for delete to authenticated using (true);

drop policy if exists "authenticated can read shortlist_players" on shortlist_players;
create policy "authenticated can read shortlist_players" on shortlist_players
  for select to authenticated using (true);
drop policy if exists "authenticated can write shortlist_players" on shortlist_players;
create policy "authenticated can write shortlist_players" on shortlist_players
  for insert to authenticated with check (true);
drop policy if exists "authenticated can delete shortlist_players" on shortlist_players;
create policy "authenticated can delete shortlist_players" on shortlist_players
  for delete to authenticated using (true);

drop policy if exists "authenticated can read player_scouting_state" on player_scouting_state;
create policy "authenticated can read player_scouting_state" on player_scouting_state
  for select to authenticated using (true);
drop policy if exists "authenticated can write player_scouting_state" on player_scouting_state;
create policy "authenticated can write player_scouting_state" on player_scouting_state
  for insert to authenticated with check (true);
drop policy if exists "authenticated can update player_scouting_state" on player_scouting_state;
create policy "authenticated can update player_scouting_state" on player_scouting_state
  for update to authenticated using (true) with check (true);

-- No policies for `anon` on any table above is intentional, not an
-- omission: it means anonymous SELECT/INSERT/UPDATE/DELETE are all
-- rejected. Verify this directly after setup — see
-- docs/AUTHENTICATION.md's verification checklist.
