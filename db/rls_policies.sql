-- Row Level Security policies — Supabase-shaped (uses Supabase's built-in
-- `anon` role). Run after schema.sql. See docs/POSTGRES_PERSISTENCE.md for
-- the important caveat about what "anon" means here: this app has no
-- login system, so these policies currently allow anyone who can reach
-- the site to read AND write shortlists/notes/status. That's a real
-- security tradeoff to weigh, not an oversight — see the doc.

alter table shortlists enable row level security;
alter table shortlist_players enable row level security;
alter table player_scouting_state enable row level security;

create policy "anon can read shortlists" on shortlists
  for select to anon using (true);
create policy "anon can write shortlists" on shortlists
  for insert to anon with check (true);
create policy "anon can update shortlists" on shortlists
  for update to anon using (true) with check (true);
create policy "anon can delete shortlists" on shortlists
  for delete to anon using (true);

create policy "anon can read shortlist_players" on shortlist_players
  for select to anon using (true);
create policy "anon can write shortlist_players" on shortlist_players
  for insert to anon with check (true);
create policy "anon can delete shortlist_players" on shortlist_players
  for delete to anon using (true);

create policy "anon can read player_scouting_state" on player_scouting_state
  for select to anon using (true);
create policy "anon can write player_scouting_state" on player_scouting_state
  for insert to anon with check (true);
create policy "anon can update player_scouting_state" on player_scouting_state
  for update to anon using (true) with check (true);
