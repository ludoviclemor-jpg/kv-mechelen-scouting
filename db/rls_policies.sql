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

-- Owner-scoped as of the 2026-09-08 redesign (see db/schema.sql's
-- "Per-scout privacy" section for the owner_id backfill/PK change this
-- depends on) — a scout's shortlists are now private to them, not shared
-- with every signed-in scout.
drop policy if exists "authenticated can read shortlists" on shortlists;
drop policy if exists "owner can read shortlists" on shortlists;
create policy "owner can read shortlists" on shortlists
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "authenticated can write shortlists" on shortlists;
drop policy if exists "owner can insert shortlists" on shortlists;
create policy "owner can insert shortlists" on shortlists
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "authenticated can update shortlists" on shortlists;
drop policy if exists "owner can update shortlists" on shortlists;
create policy "owner can update shortlists" on shortlists
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "authenticated can delete shortlists" on shortlists;
drop policy if exists "owner can delete shortlists" on shortlists;
create policy "owner can delete shortlists" on shortlists
  for delete to authenticated using (owner_id = auth.uid());

-- shortlist_players has no owner_id of its own — ownership is transitive
-- through its parent shortlist.
drop policy if exists "authenticated can read shortlist_players" on shortlist_players;
drop policy if exists "owner can read shortlist_players" on shortlist_players;
create policy "owner can read shortlist_players" on shortlist_players
  for select to authenticated using (exists (select 1 from shortlists s where s.id = shortlist_players.shortlist_id and s.owner_id = auth.uid()));
drop policy if exists "authenticated can write shortlist_players" on shortlist_players;
drop policy if exists "owner can insert shortlist_players" on shortlist_players;
create policy "owner can insert shortlist_players" on shortlist_players
  for insert to authenticated with check (exists (select 1 from shortlists s where s.id = shortlist_players.shortlist_id and s.owner_id = auth.uid()));
drop policy if exists "authenticated can delete shortlist_players" on shortlist_players;
drop policy if exists "owner can delete shortlist_players" on shortlist_players;
create policy "owner can delete shortlist_players" on shortlist_players
  for delete to authenticated using (exists (select 1 from shortlists s where s.id = shortlist_players.shortlist_id and s.owner_id = auth.uid()));

drop policy if exists "authenticated can read player_scouting_state" on player_scouting_state;
drop policy if exists "owner can read player_scouting_state" on player_scouting_state;
create policy "owner can read player_scouting_state" on player_scouting_state
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "authenticated can write player_scouting_state" on player_scouting_state;
drop policy if exists "owner can insert player_scouting_state" on player_scouting_state;
create policy "owner can insert player_scouting_state" on player_scouting_state
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "authenticated can update player_scouting_state" on player_scouting_state;
drop policy if exists "owner can update player_scouting_state" on player_scouting_state;
create policy "owner can update player_scouting_state" on player_scouting_state
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Match reports, saved searches, next actions (2026-09-08 redesign) —
-- owner-scoped from creation, same four-policy shape as shortlists above.
alter table match_reports enable row level security;
drop policy if exists "owner can read match_reports" on match_reports;
create policy "owner can read match_reports" on match_reports
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner can insert match_reports" on match_reports;
create policy "owner can insert match_reports" on match_reports
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "owner can update match_reports" on match_reports;
create policy "owner can update match_reports" on match_reports
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owner can delete match_reports" on match_reports;
create policy "owner can delete match_reports" on match_reports
  for delete to authenticated using (owner_id = auth.uid());

alter table saved_searches enable row level security;
drop policy if exists "owner can read saved_searches" on saved_searches;
create policy "owner can read saved_searches" on saved_searches
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner can insert saved_searches" on saved_searches;
create policy "owner can insert saved_searches" on saved_searches
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "owner can update saved_searches" on saved_searches;
create policy "owner can update saved_searches" on saved_searches
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owner can delete saved_searches" on saved_searches;
create policy "owner can delete saved_searches" on saved_searches
  for delete to authenticated using (owner_id = auth.uid());

alter table action_items enable row level security;
drop policy if exists "owner can read action_items" on action_items;
create policy "owner can read action_items" on action_items
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner can insert action_items" on action_items;
create policy "owner can insert action_items" on action_items
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "owner can update action_items" on action_items;
create policy "owner can update action_items" on action_items
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owner can delete action_items" on action_items;
create policy "owner can delete action_items" on action_items
  for delete to authenticated using (owner_id = auth.uid());

alter table favorite_competitions enable row level security;
drop policy if exists "authenticated can read favorite_competitions" on favorite_competitions;
create policy "authenticated can read favorite_competitions" on favorite_competitions
  for select to authenticated using (true);
drop policy if exists "authenticated can write favorite_competitions" on favorite_competitions;
create policy "authenticated can write favorite_competitions" on favorite_competitions
  for insert to authenticated with check (true);
drop policy if exists "authenticated can delete favorite_competitions" on favorite_competitions;
create policy "authenticated can delete favorite_competitions" on favorite_competitions
  for delete to authenticated using (true);

-- Sportmonks integration (TEST scope — docs/SPORTMONKS_INTEGRATION.md).
-- Read-only for `authenticated`, same as players/matches — written only
-- by scripts/sync-sportmonks-ratings.mjs's service_role key, never by the
-- frontend.
alter table player_external_ids enable row level security;
drop policy if exists "authenticated can read player_external_ids" on player_external_ids;
create policy "authenticated can read player_external_ids" on player_external_ids
  for select to authenticated using (true);

alter table player_match_ratings enable row level security;
drop policy if exists "authenticated can read player_match_ratings" on player_match_ratings;
create policy "authenticated can read player_match_ratings" on player_match_ratings
  for select to authenticated using (true);

-- Recruitment-platform foundations (2026-09-11 pass) — see schema.sql's
-- matching comment block for what each table is for.

alter table player_watch_history enable row level security;
drop policy if exists "owner can read player_watch_history" on player_watch_history;
create policy "owner can read player_watch_history" on player_watch_history
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner can insert player_watch_history" on player_watch_history;
create policy "owner can insert player_watch_history" on player_watch_history
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "owner can update player_watch_history" on player_watch_history;
create policy "owner can update player_watch_history" on player_watch_history
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owner can delete player_watch_history" on player_watch_history;
create policy "owner can delete player_watch_history" on player_watch_history
  for delete to authenticated using (owner_id = auth.uid());

-- player_alerts holds facts about players (contract windows, call-ups,
-- ...), not scout opinion — shared/read-only for every authenticated
-- scout, same convention as players/matches. No insert/update/delete
-- policy: only a future service_role generator script writes here,
-- exactly like players/matches/sync_meta.
alter table player_alerts enable row level security;
drop policy if exists "authenticated can read player_alerts" on player_alerts;
create policy "authenticated can read player_alerts" on player_alerts
  for select to authenticated using (true);

-- Read/unread state IS personal — each scout's own inbox.
alter table alert_read_state enable row level security;
drop policy if exists "owner can read alert_read_state" on alert_read_state;
create policy "owner can read alert_read_state" on alert_read_state
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner can insert alert_read_state" on alert_read_state;
create policy "owner can insert alert_read_state" on alert_read_state
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "owner can delete alert_read_state" on alert_read_state;
create policy "owner can delete alert_read_state" on alert_read_state
  for delete to authenticated using (owner_id = auth.uid());

-- Status history is an append-only log — owner can read and insert,
-- never update or delete (no such policy is intentional).
alter table player_status_history enable row level security;
drop policy if exists "owner can read player_status_history" on player_status_history;
create policy "owner can read player_status_history" on player_status_history
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner can insert player_status_history" on player_status_history;
create policy "owner can insert player_status_history" on player_status_history
  for insert to authenticated with check (owner_id = auth.uid());

-- Role profiles are club-wide config, not scout-private — same
-- "shared, no per-user ownership" convention as favorite_competitions.
-- Every authenticated scout can read and edit them for now: there is no
-- admin-only role distinct from "authenticated scout" yet (known
-- limitation — see the architecture summary this was written from).
alter table role_profiles enable row level security;
drop policy if exists "authenticated can read role_profiles" on role_profiles;
create policy "authenticated can read role_profiles" on role_profiles
  for select to authenticated using (true);
drop policy if exists "authenticated can write role_profiles" on role_profiles;
create policy "authenticated can write role_profiles" on role_profiles
  for insert to authenticated with check (true);
drop policy if exists "authenticated can update role_profiles" on role_profiles;
create policy "authenticated can update role_profiles" on role_profiles
  for update to authenticated using (true) with check (true);
drop policy if exists "authenticated can delete role_profiles" on role_profiles;
create policy "authenticated can delete role_profiles" on role_profiles
  for delete to authenticated using (true);

alter table role_profile_weights enable row level security;
drop policy if exists "authenticated can read role_profile_weights" on role_profile_weights;
create policy "authenticated can read role_profile_weights" on role_profile_weights
  for select to authenticated using (true);
drop policy if exists "authenticated can write role_profile_weights" on role_profile_weights;
create policy "authenticated can write role_profile_weights" on role_profile_weights
  for insert to authenticated with check (true);
drop policy if exists "authenticated can update role_profile_weights" on role_profile_weights;
create policy "authenticated can update role_profile_weights" on role_profile_weights
  for update to authenticated using (true) with check (true);
drop policy if exists "authenticated can delete role_profile_weights" on role_profile_weights;
create policy "authenticated can delete role_profile_weights" on role_profile_weights
  for delete to authenticated using (true);

-- Impect Data API integration — read-only for `authenticated`, same
-- convention as players/matches/scoutastic_competitions. Written only by
-- scripts/sync-impect-*.mjs's service_role key, never by the frontend.
alter table impect_competitions enable row level security;
drop policy if exists "authenticated can read impect_competitions" on impect_competitions;
create policy "authenticated can read impect_competitions" on impect_competitions
  for select to authenticated using (true);

alter table impect_squads enable row level security;
drop policy if exists "authenticated can read impect_squads" on impect_squads;
create policy "authenticated can read impect_squads" on impect_squads
  for select to authenticated using (true);

alter table impect_players enable row level security;
drop policy if exists "authenticated can read impect_players" on impect_players;
create policy "authenticated can read impect_players" on impect_players
  for select to authenticated using (true);

alter table impect_player_kpis enable row level security;
drop policy if exists "authenticated can read impect_player_kpis" on impect_player_kpis;
create policy "authenticated can read impect_player_kpis" on impect_player_kpis
  for select to authenticated using (true);

-- impect_sync_queue is an internal crawl-queue cache, never read by the
-- frontend — RLS enabled with no policy at all (denies every role
-- including authenticated), same convention as scoutastic_teams.
alter table impect_sync_queue enable row level security;

-- Player ratings — read-only for authenticated, same convention as the
-- other impect_* tables. Written only by
-- scripts/calculate-player-ratings.mjs's service_role key.
alter table player_ratings enable row level security;
drop policy if exists "authenticated can read player_ratings" on player_ratings;
create policy "authenticated can read player_ratings" on player_ratings
  for select to authenticated using (true);

-- No policies for `anon` on any table above is intentional, not an
-- omission: it means anonymous SELECT/INSERT/UPDATE/DELETE are all
-- rejected. Verify this directly after setup — see
-- docs/AUTHENTICATION.md's verification checklist.
