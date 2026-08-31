-- KV Mechelen Scouting Hub — persistence schema
--
-- Standard Postgres — works on any host (Supabase, Neon, Railway, RDS,
-- self-hosted). Row Level Security policies in rls_policies.sql are
-- Supabase-shaped specifically (that's the recommended host for a static
-- frontend — see docs/POSTGRES_PERSISTENCE.md) but the schema itself
-- doesn't depend on any vendor.
--
-- `players` moved here from a committed data/players.json file once the
-- SCOUTASTIC import expanded to "every competition" (~400K+ players
-- worldwide, discovered via GET /competitions) — a single git-committed
-- JSON file and one static HTML page per player both stop being viable
-- at that scale. See docs/SCOUTASTIC_SYNC.md for the full story.
-- shortlist_players/player_scouting_state key against `players.id` by
-- plain TEXT match, not a foreign key — a shortlisted player who's no
-- longer returned by a sync becomes `active = false`, never deleted, so
-- the reference never dangles, but keeping it a soft reference (not an
-- FK) means the sync script's upserts never need to worry about
-- constraint ordering.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm; -- trigram indexes for fast ILIKE '%term%' search

create table if not exists players (
  id text primary key, -- 'sc-{scoutastic_player_id}'
  scoutastic_player_id text not null unique,
  source text not null default 'SCOUTASTIC',

  first_name text,
  last_name text,
  name text not null,
  photo_url text,

  date_of_birth date,
  nationality text,
  second_nationality text,
  is_african boolean not null default false,

  position text,
  position_raw text,
  secondary_positions text[],

  club text,
  previous_club text,
  teams jsonb not null default '[]',

  league text,
  league_country text,
  competition_id text,
  is_eastern_european_league boolean not null default false,

  height_cm integer,
  preferred_foot text,
  agent text,
  market_value_eur bigint,
  contract_expiry date,

  appearances integer,
  minutes integer,
  goals integer,
  assists integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  active boolean not null default true,

  is_youth_or_reserve boolean not null default false,

  -- ratings enrichment — field names are a historical "SofaScore" label,
  -- the active provider is API-Football; see docs/SOFASCORE_PROVIDER.md
  sofascore_player_id text,
  sofascore_match_status text not null default 'pending'
    check (sofascore_match_status in ('pending', 'matched', 'ambiguous', 'not_found')),
  sofascore_match_confidence numeric,
  ratings_team_id text,
  last_sofascore_sync_at timestamptz,
  matches jsonb not null default '[]',
  -- Denormalized count of rated matches in `matches` — lets "top
  -- performers" filter with a plain indexed comparison instead of a
  -- jsonb_array_length() scan (PostgREST/Supabase JS can't express that
  -- filter directly). Set by the ratings sync script alongside `matches`.
  rated_matches_count integer not null default 0,
  is_debutant boolean not null default false,
  debut_date date,
  rating_average numeric,
  rating_highest numeric,
  rating_lowest numeric
);

-- Filters used throughout the app (Players page, Debutants, Top Performers, Reports)
create index if not exists idx_players_active on players(active) where active = true;
create index if not exists idx_players_is_african on players(is_african) where is_african = true;
create index if not exists idx_players_is_eastern_europe on players(is_eastern_european_league) where is_eastern_european_league = true;
create index if not exists idx_players_is_debutant on players(is_debutant) where is_debutant = true;
create index if not exists idx_players_position on players(position);
create index if not exists idx_players_nationality on players(nationality);
create index if not exists idx_players_league on players(league);
create index if not exists idx_players_club on players(club);
create index if not exists idx_players_status on players(sofascore_match_status);
create index if not exists idx_players_market_value on players(market_value_eur);
create index if not exists idx_players_contract_expiry on players(contract_expiry);
create index if not exists idx_players_rating_average on players(rating_average);
create index if not exists idx_players_rated_matches_count on players(rated_matches_count);
create index if not exists idx_players_added on players(created_at);
-- Search bar ("Search player, club or nationality...") — trigram indexes
-- make `ILIKE '%term%'` fast even across hundreds of thousands of rows.
create index if not exists idx_players_name_trgm on players using gin (name gin_trgm_ops);
create index if not exists idx_players_club_trgm on players using gin (club gin_trgm_ops);
create index if not exists idx_players_nationality_trgm on players using gin (nationality gin_trgm_ops);

-- Crawl queue/cache for the full-SCOUTASTIC-catalog sync. Discovering
-- every competition (GET /competitions, ~2,439 results) and every team
-- within the ones that qualify (~725 competitions, ~15,989 teams) is
-- itself real work — these tables cache that discovery so it doesn't
-- have to be redone every sync run, and double as the resumable work
-- queue for the actual squad-crawling (see docs/SCOUTASTIC_SYNC.md).
create table if not exists scoutastic_competitions (
  competition_id text primary key,
  name text,
  area text,
  association text,
  age_category text,
  is_active boolean not null default true,
  team_count integer not null default 0,
  discovered_at timestamptz not null default now()
);

create table if not exists scoutastic_teams (
  team_id text primary key,
  competition_id text not null references scoutastic_competitions(competition_id) on delete cascade,
  name text,
  discovered_at timestamptz not null default now(),
  last_crawled_at timestamptz -- null = never crawled, always processed first
);

create index if not exists idx_scoutastic_teams_last_crawled on scoutastic_teams(last_crawled_at nulls first);
create index if not exists idx_scoutastic_teams_competition on scoutastic_teams(competition_id);

-- Single-row sync status, read by the Sidebar/Settings/SyncStatusBanner —
-- moved out of data/players.json's `meta` object along with everything
-- else. `source` is the primary key but this is a singleton in practice
-- (one row, 'SCOUTASTIC') — a real table rather than a fixed-id row so
-- the shape stays ordinary Postgres, no singleton-check trickery.
create table if not exists sync_meta (
  source text primary key,
  last_synced_at timestamptz,
  last_sync_status text not null default 'never_run'
    check (last_sync_status in ('never_run', 'success', 'partial', 'failed')),
  last_sync_summary jsonb,
  players_count integer not null default 0,
  active_players_count integer not null default 0
);

-- Bounded distinct-value lookups for the Players page filter dropdowns.
-- Selecting `distinct nationality` etc. straight from `players` stays
-- cheap even at hundreds of thousands of rows because the *output* is
-- small (a few hundred countries/leagues, ~16k clubs at full SCOUTASTIC
-- scale) — the index makes the scan itself cheap too.
--
-- `security_invoker = true` matters here: without it, a Postgres view
-- checks RLS as its *owner*, not the querying user — Supabase's #1 view
-- gotcha. With it, these views are only ever as permissive as `players`
-- itself already is.
create or replace view player_nationalities
  with (security_invoker = true) as
  select distinct nationality as value from players where nationality is not null order by 1;
create or replace view player_leagues
  with (security_invoker = true) as
  select distinct league as value from players where league is not null order by 1;
create or replace view player_clubs
  with (security_invoker = true) as
  select distinct club as value from players where club is not null order by 1;

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

drop trigger if exists trg_players_updated_at on players;
create trigger trg_players_updated_at
  before update on players
  for each row execute function set_updated_at();
