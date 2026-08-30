-- Row Level Security policies — Supabase-shaped (uses Supabase's built-in
-- `authenticated` role, granted automatically to any request carrying a
-- valid session JWT from a signed-in user). Run after schema.sql.
--
-- Deliberately grants NOTHING to `anon` — RLS denies by default when a
-- table has it enabled and no policy matches the requesting role, so an
-- unauthenticated request is rejected by Postgres itself, not by
-- frontend code. See docs/AUTHENTICATION.md for what this does and does
-- not protect (short version: this table's data — genuinely secure; the
-- separately-synced player database in data/players.json — not covered
-- by this file at all, since it isn't stored in Postgres).
--
-- Every authenticated user gets the same access (no per-user ownership
-- model) — this is an internal club tool where any signed-in scout is
-- trusted with all shortlists/notes, not a multi-tenant app.

alter table shortlists enable row level security;
alter table shortlist_players enable row level security;
alter table player_scouting_state enable row level security;

create policy "authenticated can read shortlists" on shortlists
  for select to authenticated using (true);
create policy "authenticated can write shortlists" on shortlists
  for insert to authenticated with check (true);
create policy "authenticated can update shortlists" on shortlists
  for update to authenticated using (true) with check (true);
create policy "authenticated can delete shortlists" on shortlists
  for delete to authenticated using (true);

create policy "authenticated can read shortlist_players" on shortlist_players
  for select to authenticated using (true);
create policy "authenticated can write shortlist_players" on shortlist_players
  for insert to authenticated with check (true);
create policy "authenticated can delete shortlist_players" on shortlist_players
  for delete to authenticated using (true);

create policy "authenticated can read player_scouting_state" on player_scouting_state
  for select to authenticated using (true);
create policy "authenticated can write player_scouting_state" on player_scouting_state
  for insert to authenticated with check (true);
create policy "authenticated can update player_scouting_state" on player_scouting_state
  for update to authenticated using (true) with check (true);

-- No policies for `anon` on any table above is intentional, not an
-- omission: it means anonymous SELECT/INSERT/UPDATE/DELETE are all
-- rejected. Verify this directly after setup — see
-- docs/AUTHENTICATION.md's verification checklist.
