-- STANDALONE migration — new Impect tables only. Does NOT touch, depend
-- on, or require the earlier per-scout-privacy migration (owner_id,
-- match_reports, saved_searches, action_items, status pipeline) to have
-- succeeded first. Safe to run on its own, in the Supabase SQL Editor,
-- right now.
--
-- Purely additive: five brand-new tables (impect_competitions,
-- impect_squads, impect_players, impect_player_kpis, impect_sync_queue),
-- nothing existing is altered or dropped.

-- Defensive: the earlier, still-unresolved migration attempts mean it's
-- unclear whether even the base extensions have ever successfully been
-- created on this database — `idx_impect_players_name_trgm` below needs
-- pg_trgm. Idempotent either way.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ============================================================
-- Impect Data API integration (2026-09-11+) — standalone. No dependency
-- on the per-scout-privacy migration above (no owner_id, no auth.users
-- reference anywhere here) — safe to run on its own even if that
-- migration hasn't been applied yet. See
-- docs/impect-openapi-v4.1.2.json for the confirmed real API surface
-- this is built against.
--
-- Shared, read-only reference data (real facts from Impect), same
-- convention as players/matches/scoutastic_competitions — written only
-- by scripts/sync-impect-*.mjs's service_role key.
--
-- Scale note: Impect's real catalog is 759 competition-seasons
-- worldwide (confirmed live) — far too much to sync in one run without
-- risking Impect's own rate limits, and far too much to ever bundle
-- into the static frontend build (that's exactly why this lives in
-- Postgres with real indexes/pagination instead of a committed JSON
-- file, the same lesson this project already learned once for
-- Scoutastic — see this file's very first comment). `impect_sync_queue`
-- is a resumable crawl queue (same pattern as `scoutastic_teams` above)
-- so coverage grows incrementally across repeated runs instead of
-- needing to finish in one sitting.
-- ============================================================

create table if not exists impect_competitions (
  iteration_id integer primary key, -- Impect's own iteration id
  competition_id integer not null,
  competition_name text not null,
  competition_type text not null, -- real values confirmed live: 'League' | 'Cup' | 'Friendly' | 'Relegation'
  season text not null,
  country_id integer,
  gender text not null,
  age_group text not null, -- 'ADULT' | 'YOUTH'
  transfermarkt_ids text[] not null default '{}', -- Impect's own cross-reference, when it has one
  last_synced_at timestamptz
);
create index if not exists idx_impect_competitions_country on impect_competitions(country_id);

create table if not exists impect_squads (
  squad_id integer primary key,
  iteration_id integer not null references impect_competitions(iteration_id) on delete cascade,
  name text not null,
  last_synced_at timestamptz
);
create index if not exists idx_impect_squads_iteration on impect_squads(iteration_id);

create table if not exists impect_players (
  player_id integer primary key,
  firstname text,
  lastname text,
  commonname text not null,
  birthdate date,
  leg text,
  height numeric,
  transfermarkt_id text, -- real bridge to this project's own scoutastic_player_id space
  last_synced_at timestamptz
);
create index if not exists idx_impect_players_transfermarkt on impect_players(transfermarkt_id);
create index if not exists idx_impect_players_name_trgm on impect_players using gin (commonname gin_trgm_ops);

-- `kpis` is a flat {kpiName: value} jsonb map rather than one column per
-- KPI — the real catalog has 1458 entries (docs/impect-kpi-definitions.json)
-- and grows; a fixed-column table would need a migration every time the
-- synced KPI selection changes. Only confirmed real KPI names ever go in
-- here (see scripts/lib/impectKpis.mjs once that exists) — never invented.
create table if not exists impect_player_kpis (
  iteration_id integer not null references impect_competitions(iteration_id) on delete cascade,
  squad_id integer not null references impect_squads(squad_id) on delete cascade,
  player_id integer not null references impect_players(player_id) on delete cascade,
  position text,
  minutes integer,
  match_share numeric,
  kpis jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (iteration_id, player_id)
);
create index if not exists idx_impect_player_kpis_player on impect_player_kpis(player_id);
create index if not exists idx_impect_player_kpis_iteration on impect_player_kpis(iteration_id);
create index if not exists idx_impect_player_kpis_squad on impect_player_kpis(squad_id);

-- Resumable crawl queue — same shape/reasoning as scoutastic_teams
-- above. One row per competition-season; `last_synced_at is null` means
-- "never synced, process first", exactly the same nulls-first ordering.
create table if not exists impect_sync_queue (
  iteration_id integer primary key references impect_competitions(iteration_id) on delete cascade,
  last_synced_at timestamptz
);
create index if not exists idx_impect_sync_queue_last_synced on impect_sync_queue(last_synced_at nulls first);

-- ==== RLS policies (from db/rls_policies.sql) ====

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
