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

-- `players` predates these two columns (see the scoutastic_competitions
-- comment above for why `create table if not exists` alone can't add
-- them to an already-existing deployment) — idempotent either way.
--
-- performance_seasons: flattened performanceSummary, one row per
-- (season, competition), club and international both included but
-- tagged (isInternational) — powers the player-profile Stats/Game
-- Time/International sections. See docs/PLAYER_PROFILE.md and
-- scripts/lib/fieldMap.mjs's extractPerformanceSeasons().
--
-- played_positions: real per-position appearance counts (e.g.
-- {"leftback": 23}), confirmed available on every squad-crawl response
-- at no extra API cost — "positions actually played", not the generic
-- registered `position` above. Null, never a guess, when SCOUTASTIC has
-- nothing for this player. See scripts/lib/fieldMap.mjs's extractPlayedPositions().
alter table players add column if not exists performance_seasons jsonb not null default '[]';
alter table players add column if not exists played_positions jsonb;

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
-- Loan Watch (docs/LOAN_WATCH.md) — fetchLoanWatchCandidates() filters +
-- sorts on `minutes` across the full table; without this the query timed
-- out for real at 177k rows (confirmed live, 2026-08-31: "statement
-- timeout" on an unindexed range + order scan). A plain `minutes` index
-- alone still took 8+ real seconds once `appearances > 0` was added —
-- most low-minutes rows have 0 appearances, so Postgres had to walk deep
-- into the minutes-ordered index checking that condition row by row
-- before collecting 300 real matches. The partial predicate below
-- matches the query's actual WHERE clause so the planner can use the
-- index directly instead of filtering after the fact.
drop index if exists idx_players_minutes;
create index if not exists idx_players_loan_watch on players(minutes) where minutes is not null and appearances > 0;
-- Search bar ("Search player, club or nationality...") — trigram indexes
-- make `ILIKE '%term%'` fast even across hundreds of thousands of rows.
create index if not exists idx_players_name_trgm on players using gin (name gin_trgm_ops);
create index if not exists idx_players_club_trgm on players using gin (club gin_trgm_ops);
create index if not exists idx_players_nationality_trgm on players using gin (nationality gin_trgm_ops);

-- Full SCOUTASTIC competition catalog (GET /competitions, ~2,439 results
-- worldwide) — both the browsable "Competitions" feature's data source and
-- the crawl queue/cache for the full-SCOUTASTIC-catalog player sync (see
-- docs/SCOUTASTIC_SYNC.md, docs/COMPETITIONS.md). `competition_id` is
-- SCOUTASTIC's own stable code (its `transfermarktId`, e.g. "PO1") — used
-- directly as the primary key, same convention as `players.scoutastic_player_id`
-- being the natural key there; no synthetic id needed.
--
-- `level`/`level_definition` are stored verbatim from SCOUTASTIC (e.g.
-- level 2 / "Second Tier", level 14 / "League Cup") rather than mapped
-- into an invented "type" taxonomy — SCOUTASTIC already combines tier and
-- competition-type into this one human-readable label, confirmed against
-- real responses; inventing a separate classification would just be
-- guessing at a distinction SCOUTASTIC doesn't actually draw.
create table if not exists scoutastic_competitions (
  competition_id text primary key,
  name text,
  area text, -- country/region name — SCOUTASTIC gives no separate country id
  association text, -- confederation code, e.g. "UEFA", "CAF", "AFC"
  age_category text, -- "Senior" vs youth categories, straight from SCOUTASTIC
  is_active boolean not null default true,
  team_count integer not null default 0
);

-- This table predates the columns below (created empty by an earlier
-- version of this schema, possibly already applied to a live database) —
-- `create table if not exists` above is then a no-op there, so every new
-- column needs its own idempotent `add column if not exists` to actually
-- reach an existing deployment. Safe either way: fresh install or
-- already-existing empty table (never populated by any completed sync —
-- see docs/SCOUTASTIC_SYNC.md).
alter table scoutastic_competitions add column if not exists is_european boolean not null default false; -- association = 'UEFA', computed at sync time
alter table scoutastic_competitions add column if not exists gender text;
alter table scoutastic_competitions add column if not exists level integer;
alter table scoutastic_competitions add column if not exists level_definition text;
alter table scoutastic_competitions add column if not exists logo_url text;
alter table scoutastic_competitions add column if not exists available_seasons jsonb not null default '[]';
alter table scoutastic_competitions add column if not exists current_season integer;
alter table scoutastic_competitions add column if not exists season_start_date date;
alter table scoutastic_competitions add column if not exists season_end_date date;
alter table scoutastic_competitions add column if not exists created_at timestamptz not null default now();
alter table scoutastic_competitions add column if not exists updated_at timestamptz not null default now();
alter table scoutastic_competitions add column if not exists last_scoutastic_sync_at timestamptz;

create index if not exists idx_competitions_is_european on scoutastic_competitions(is_european) where is_european = true;
create index if not exists idx_competitions_area on scoutastic_competitions(area);
create index if not exists idx_competitions_is_active on scoutastic_competitions(is_active) where is_active = true;
create index if not exists idx_competitions_name_trgm on scoutastic_competitions using gin (name gin_trgm_ops);

-- Many-to-many: a real club can play in a domestic league AND a domestic
-- cup AND a continental competition in the same season — a single
-- competition_id column on a teams table (the original, never-populated
-- version of this schema) can't represent that. This junction is
-- populated directly from GET /competitions' inline `teamIds` — no extra
-- per-competition request needed (see docs/COMPETITIONS.md).
create table if not exists competition_teams (
  competition_id text not null references scoutastic_competitions(competition_id) on delete cascade,
  team_id text not null,
  team_name text,
  primary key (competition_id, team_id)
);

create index if not exists idx_competition_teams_team on competition_teams(team_id);

-- Pure crawl queue/cache for the resumable player-squad crawl (see
-- docs/SCOUTASTIC_SYNC.md) — deliberately has no competition reference of
-- its own now that competition_teams models that relationship properly;
-- a team's crawl status doesn't depend on which competition(s) it's in.
create table if not exists scoutastic_teams (
  team_id text primary key,
  name text,
  discovered_at timestamptz not null default now(),
  last_crawled_at timestamptz -- null = never crawled, always processed first
);

create index if not exists idx_scoutastic_teams_last_crawled on scoutastic_teams(last_crawled_at nulls first);

-- scoutastic_teams predates the competition_teams junction above — its
-- old single-competition column is now redundant (superseded, not
-- preserved: never populated by any completed sync, see comment further
-- up). scoutastic_competitions' old `discovered_at` is superseded by
-- `created_at`/`updated_at` the same way.
alter table scoutastic_teams drop column if exists competition_id;
alter table scoutastic_competitions drop column if exists discovered_at;

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

-- Match data for the Explore feature (docs/EXPLORE.md). GET /matches
-- (SCOUTASTIC, confirmed real 2026-08-31) returns a genuinely complete
-- match sheet — formation, full lineup with pitch position order,
-- events timeline, venue, referee — see docs/EXPLORE.md for the
-- confirmed field-by-field shape. `date`/`matchId` aren't real filters on
-- that endpoint (silently ignored, confirmed the hard way) — only
-- `competitionId` + `season` actually filter — so "browse by day" is
-- only possible by syncing matches into Postgres and querying here,
-- same reasoning as the player crawl.
--
-- Scoped to each competition's *current* season only (not full
-- historical archives back to the 1970s-1990s SCOUTASTIC also has) —
-- Explore is about browsing recent/upcoming matches, not deep history.
create table if not exists matches (
  id text primary key, -- SCOUTASTIC's transfermarktId, same convention as players/competitions
  competition_id text references scoutastic_competitions(competition_id) on delete cascade,
  season text,
  matchday integer,
  date timestamptz,
  status text, -- e.g. 'played', 'open' — confirmed real values, not treated as an exhaustive enum (a new one showing up shouldn't fail a sync)
  score text,
  score_home integer,
  score_away integer,
  home_team_id text,
  away_team_id text,
  home_team_name text,
  away_team_name text,
  home_team_tactic text, -- e.g. "4-2-3-1" — confirmed real, not always present
  away_team_tactic text,
  venue_name text,
  venue_city text,
  venue_area text,
  referee_name text,
  home_team_players jsonb not null default '[]', -- full lineup: {id,firstName,lastName,mainPosition,lineUpIdx,inLineup,minutesPlayed,goals,assists,captain,shirtNumber}
  away_team_players jsonb not null default '[]',
  events jsonb not null default '[]', -- goals/cards/subs, each with gameMinute
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_scoutastic_sync_at timestamptz
);

create index if not exists idx_matches_date on matches(date);
create index if not exists idx_matches_competition on matches(competition_id);
create index if not exists idx_matches_status on matches(status);

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

-- Cascading Country -> Competition -> Club filters (Players, Debutants,
-- Top Performers, Explore). Plain views can't take a parameter, so these
-- are functions instead — `security invoker` is the function equivalent
-- of a view's `security_invoker = true`: without it, a function runs
-- with its *owner's* privileges, bypassing the caller's RLS entirely.
-- `stable` (not `volatile`) tells Postgres this only reads data, letting
-- it optimize accordingly. `players.league` is already "the competition's
-- country" (set at sync time from the competition being crawled, see
-- scripts/lib/fieldMap.mjs) — the real competition *name* only exists on
-- scoutastic_competitions, hence the join below.
create or replace function player_competitions_in_country(country text)
returns table(competition_id text, name text) as $$
  select distinct p.competition_id, sc.name
  from players p
  left join scoutastic_competitions sc on sc.competition_id = p.competition_id
  where p.league = country and p.competition_id is not null and p.active = true
  order by sc.name;
$$ language sql stable security invoker;

create or replace function player_clubs_in_competition(comp_id text)
returns table(club text) as $$
  select distinct p.club
  from players p
  where p.competition_id = comp_id and p.club is not null and p.active = true
  order by p.club;
$$ language sql stable security invoker;

-- Same reasoning, for the Competitions page's country filter. Scoped to
-- Senior + male, matching the page's default (confirmed live: the raw
-- European set is 1,350 competitions, most youth/women's — see
-- docs/COMPETITIONS.md) — otherwise this would list a country whose only
-- European competitions are youth leagues, with nothing to actually show.
create or replace view competition_countries
  with (security_invoker = true) as
  select distinct area as value from scoutastic_competitions
  where is_european = true and age_category = 'Senior' and gender = 'male' and area is not null
  order by 1;

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

-- Real "first call-up" (squad selection), not "first appearance" — see
-- docs/INTERNATIONAL_CALLUPS.md. One row per (player, level): a player
-- can have both a U21 row and, later, a separate Senior row. Populated by
-- scripts/sync-international-callups.mjs, which only ever moves
-- first_call_up_date *earlier* on a re-run (a later sync window covering
-- more history should never regress an already-detected earlier date).
create table if not exists player_international_callups (
  player_id text not null references players(id) on delete cascade,
  level text not null, -- the competition's age_category at match time: 'Senior', 'U21', 'U20', 'U19', 'U18', 'U17', or whatever else SCOUTASTIC returns — not a fixed enum, since the real data isn't one either
  team_name text not null, -- e.g. "Belgium", "Belgium U21" — the national team as SCOUTASTIC names it
  team_id text,
  competition_id text references scoutastic_competitions(competition_id) on delete set null,
  first_call_up_date date not null,
  -- true if the player actually played (inLineup or minutesPlayed > 0) in
  -- that first call-up match, not just an unused squad member — lets the
  -- UI distinguish "called up and played" from "called up, unused".
  first_call_up_appeared boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (player_id, level)
);

create index if not exists idx_player_intl_callups_date on player_international_callups(first_call_up_date desc);

-- AI Scouting Tips (docs/AI_TIPS.md) — insert-only, one row per generation
-- run (scripts/generate-ai-tips.mjs, scheduled). `tips` is an array of
-- { title, detail } generated by an LLM from real, current data pulled
-- from this same database (`context_summary` records exactly what was
-- fed in, for transparency/audit) — never fabricated facts about a
-- specific player beyond what the model was actually given. The
-- frontend only ever reads the single most recent row.
create table if not exists ai_scouting_tips (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  model text not null,
  tips jsonb not null,
  context_summary jsonb not null
);

create index if not exists idx_ai_scouting_tips_generated_at on ai_scouting_tips(generated_at desc);

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

drop trigger if exists trg_scoutastic_competitions_updated_at on scoutastic_competitions;
create trigger trg_scoutastic_competitions_updated_at
  before update on scoutastic_competitions
  for each row execute function set_updated_at();

drop trigger if exists trg_matches_updated_at on matches;
create trigger trg_matches_updated_at
  before update on matches
  for each row execute function set_updated_at();

drop trigger if exists trg_player_international_callups_updated_at on player_international_callups;
create trigger trg_player_international_callups_updated_at
  before update on player_international_callups
  for each row execute function set_updated_at();
