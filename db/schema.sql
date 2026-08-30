-- KV Mechelen Scouting Hub — persistence schema (Phase 3)
--
-- Standard Postgres — works on any host (Supabase, Neon, Railway, RDS,
-- self-hosted). Row Level Security policies in rls_policies.sql are
-- Supabase-shaped specifically (that's the recommended host for a static
-- frontend — see docs/POSTGRES_PERSISTENCE.md) but the schema itself
-- doesn't depend on any vendor.
--
-- What lives here vs. what doesn't:
--   Shortlists, scouting status, scouting notes  -> HERE (user-writable,
--     needs a live database reachable from the browser)
--   Players, SofaScore ratings                   -> data/players.json,
--     synced by CI (read-only from the browser's perspective, no need for
--     a live database — see docs/SCOUTASTIC_SYNC.md, docs/SOFASCORE_PROVIDER.md)
--
-- scoutastic_player_id (TEXT, not a foreign key) is how rows here relate
-- to a player — there's no players table in this database; the player
-- universe lives in the committed JSON. A player_id with no matching
-- SCOUTASTIC record just means "no longer synced", handled by the
-- application layer, not a DB constraint.

create extension if not exists pgcrypto;

create table if not exists shortlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shortlist_players (
  shortlist_id uuid not null references shortlists(id) on delete cascade,
  scoutastic_player_id text not null,
  added_at timestamptz not null default now(),
  primary key (shortlist_id, scoutastic_player_id)
);

create table if not exists player_scouting_state (
  scoutastic_player_id text primary key,
  status text not null default 'not_assessed'
    check (status in ('not_assessed', 'monitoring', 'interested', 'priority', 'rejected')),
  notes_strengths text not null default '',
  notes_weaknesses text not null default '',
  notes_recommendation text not null default '',
  notes_general text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists idx_shortlist_players_player on shortlist_players(scoutastic_player_id);

-- keep updated_at current on write, instead of relying on every caller to set it
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_shortlists_updated_at on shortlists;
create trigger trg_shortlists_updated_at
  before update on shortlists
  for each row execute function set_updated_at();

drop trigger if exists trg_player_scouting_state_updated_at on player_scouting_state;
create trigger trg_player_scouting_state_updated_at
  before update on player_scouting_state
  for each row execute function set_updated_at();
