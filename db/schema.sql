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

-- market_value_history: real, confirmed dated market-value points
-- ({value, date}) from SCOUTASTIC's `marketValueHistory` array — powers
-- the player-profile market value trend chart. injury_history: real
-- confirmed injury spells ({description, from, to, season}) from
-- `injuryHistory` (needs injuryData=true, now on by default in
-- scripts/lib/scoutasticClient.mjs's fetchTeamPlayers). youth_teams: a
-- raw free-text string of youth clubs + date ranges (e.g. "AS Bondy
-- (2004-2011), ..."), confirmed real but youth-career only — SCOUTASTIC
-- has no confirmed source for senior transfer/club history (teams[] on
-- the player object only ever carries the *current* club, verified
-- against real players with well-documented transfer histories). See
-- docs/PLAYER_PROFILE.md.
alter table players add column if not exists market_value_history jsonb not null default '[]';
alter table players add column if not exists injury_history jsonb not null default '[]';
alter table players add column if not exists youth_teams text;

-- Filters used throughout the app (Players page, Debutants, Top Performers, Reports)
create index if not exists idx_players_active on players(active) where active = true;
create index if not exists idx_players_is_african on players(is_african) where is_african = true;
create index if not exists idx_players_is_eastern_europe on players(is_eastern_european_league) where is_eastern_european_league = true;
create index if not exists idx_players_is_debutant on players(is_debutant) where is_debutant = true;
create index if not exists idx_players_position on players(position);
create index if not exists idx_players_nationality on players(nationality);
create index if not exists idx_players_league on players(league);
create index if not exists idx_players_club on players(club);
-- player_clubs_in_competition() (cascading Country -> Competition ->
-- Club filter, used by Players/Loan Watch/Debutants/Top Performers/
-- Explore) filters WHERE competition_id = ... — confirmed live: with no
-- index on this column at all, that's a full sequential scan across the
-- whole players table (177k+ rows), which reproduced as a consistent
-- outright statement timeout ("Couldn't load data" on Loan Watch,
-- 2026-08-31), not just slowness.
create index if not exists idx_players_competition_id on players(competition_id);
create index if not exists idx_players_status on players(sofascore_match_status);
create index if not exists idx_players_market_value on players(market_value_eur);
-- The Players page's *default* view (no filters, sorted by market value
-- descending — fetchPlayersPage's default sortKey) does
-- `ORDER BY market_value_eur DESC NULLS LAST`, but a plain btree index's
-- natural order for DESC is NULLS FIRST — the mismatch meant Postgres
-- couldn't use the index above for this exact sort and fell back to
-- sorting the ~177k-row `active = true` scan directly. Confirmed live:
-- this reproduced the reported "Couldn't load data" on the Players page
-- — 8-9+ seconds / outright statement timeout even with the plain index
-- in place. This index matches the query's actual requested order.
create index if not exists idx_players_market_value_desc on players(market_value_eur desc nulls last);
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

-- Explore's competition favorites (docs/EXPLORE.md) — shared across all
-- scouts, same "no per-user ownership model" convention as shortlists/
-- player_scouting_state above (this is an internal club tool, not
-- multi-tenant). Keyed by the stable SCOUTASTIC competition_id, not name.
create table if not exists favorite_competitions (
  competition_id text primary key references scoutastic_competitions(competition_id) on delete cascade,
  added_at timestamptz not null default now()
);

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
  -- team_name with any trailing " U<number>" stripped — "Belgium" for
  -- both "Belgium" and "Belgium U21" — so the Country filter can group
  -- every level of a nation together. Same regex as levelFromTeamName()
  -- in scripts/sync-international-callups.mjs, kept in sync there.
  country text not null default '',
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

-- `country` predates this column on an already-deployed table (see the
-- scoutastic_competitions comment earlier in this file for why
-- `create table if not exists` alone can't add it there) — backfilled
-- from the already-stored team_name for every existing row, so no re-sync
-- against the SCOUTASTIC API is needed.
alter table player_international_callups add column if not exists country text not null default '';
update player_international_callups set country = regexp_replace(team_name, '\s+U-?\d{1,2}$', '', 'i') where country = '';

create index if not exists idx_player_intl_callups_date on player_international_callups(first_call_up_date desc);
create index if not exists idx_player_intl_callups_country on player_international_callups(country);

-- Country filter dropdown on /call-ups. A plain `.select("country")` with
-- client-side dedup would need every row (~9k+ and growing) and hit
-- PostgREST's 1,000-row cap (see docs/SCOUTASTIC_SYNC.md) — same reasoning
-- as player_nationalities/player_leagues/player_clubs below.
create or replace view call_up_countries
  with (security_invoker = true) as
  select distinct country as value from player_international_callups where country <> '' order by 1;

-- Dashboard "Today's Matches" widget — real KV Mechelen fixtures (their
-- own matches are genuinely in `matches`, same as any other crawled club
-- — confirmed live, e.g. real "KV Mechelen vs Royal Antwerp FC" rows)
-- and matches featuring a shortlisted/priority-status player should
-- surface before an arbitrary early-kickoff match nobody's tracking.
-- Ranks server-side rather than bulk-fetching every match's lineup to
-- the client to check relevance — a busy day can have 200+ matches
-- worldwide (confirmed live), the exact bulk-lineup-fetch cost
-- docs/EXPLORE.md already ruled out for the list-level African/
-- Shortlisted filters. `security invoker` since this reads `matches`/
-- `shortlist_players`/`player_scouting_state`, all RLS-protected.
create or replace function todays_relevant_match_ids(match_date date, result_limit integer default 6)
returns table(match_id text) as $$
  with relevant_players as (
    select scoutastic_player_id from shortlist_players
    union
    select scoutastic_player_id from player_scouting_state where status = 'priority'
  )
  select m.id
  from matches m
  where m.date >= match_date::timestamptz and m.date < (match_date + 1)::timestamptz
  order by
    (m.home_team_name = 'KV Mechelen' or m.away_team_name = 'KV Mechelen') desc,
    (
      exists (select 1 from jsonb_array_elements(m.home_team_players) e where (e ->> 'id') in (select scoutastic_player_id from relevant_players))
      or exists (select 1 from jsonb_array_elements(m.away_team_players) e where (e ->> 'id') in (select scoutastic_player_id from relevant_players))
    ) desc,
    m.date asc
  limit result_limit;
$$ language sql stable security invoker;

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

-- Sportmonks integration — TEST scope, Danish Superliga + Scottish
-- Premiership only (docs/SPORTMONKS_INTEGRATION.md). A second, independent
-- match-ratings source alongside the existing SofaScore/API-Football
-- provider slot (docs/SOFASCORE_PROVIDER.md) — deliberately its own
-- tables, not a reuse of players.matches/rating_*, since this is a scoped
-- trial that must not touch that slot's behavior at all.

-- Maps an existing Scoutastic player (players.id) to an external
-- provider's own player id. Never creates or overwrites a Scoutastic
-- player row — purely additive tagging, one row per (player, provider).
create table if not exists player_external_ids (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references players(id) on delete cascade,
  provider text not null, -- 'sportmonks' today; the column exists so a second provider never needs a schema change
  external_player_id text not null,
  external_team_id text,
  matched_at timestamptz not null default now(),
  -- 'external_id' (an already-stored mapping reused, no fresh score) |
  -- 'name_club' | 'normalized_name_club' | 'dob_name' — see
  -- scripts/sync-sportmonks-ratings.mjs's matching order and
  -- scripts/lib/sofascoreMatching.mjs's resolveMatch(), reused as-is (its
  -- name-scoring logic is provider-agnostic despite the filename).
  match_method text not null,
  confidence numeric, -- 0-1 from resolveMatch(); null only for 'external_id'
  unique (player_id, provider),
  unique (provider, external_player_id)
);

create index if not exists idx_player_external_ids_provider on player_external_ids(provider);

-- Per-match player ratings from an external provider. The provider column
-- and the fixture_id+external_player_id+provider unique constraint exist
-- so a second provider or a wider league scope later never need a schema
-- change, only a new sync script (see docs/SPORTMONKS_INTEGRATION.md's
-- "adding more leagues" section).
create table if not exists player_match_ratings (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references players(id) on delete cascade,
  provider text not null,
  external_player_id text not null,
  fixture_id text not null,
  -- the *external* provider's own competition/league id (Sportmonks
  -- league_id, e.g. "271") — a different id space from
  -- scoutastic_competitions.competition_id, never conflated with it.
  competition_id text,
  competition_name text,
  season_id text,
  match_date date not null,
  opponent text,
  home_away text check (home_away in ('home', 'away')),
  minutes_played integer,
  starter boolean,
  rating numeric not null, -- 0-10 scale, exactly as the provider returns it — never recomputed or rescaled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, external_player_id, provider)
);

create index if not exists idx_player_match_ratings_player on player_match_ratings(player_id, provider, match_date desc);
create index if not exists idx_player_match_ratings_provider on player_match_ratings(provider);

drop trigger if exists trg_player_match_ratings_updated_at on player_match_ratings;
create trigger trg_player_match_ratings_updated_at
  before update on player_match_ratings
  for each row execute function set_updated_at();

-- Homepage "Top Rated Players" widget (docs/SPORTMONKS_INTEGRATION.md) —
-- averages each player's most recent 5 sportmonks ratings ("recent form",
-- never a full-career average). `security invoker` since this reads
-- player_match_ratings/players, both RLS-protected.
create or replace function sportmonks_top_rated_players(
  min_avg_rating numeric default 0,
  min_appearances integer default 3,
  filter_competition_ids text[] default null,
  result_limit integer default 10
)
returns table (
  player_id text,
  player_name text,
  club text,
  competition_id text,
  competition_name text,
  avg_rating numeric,
  rated_matches bigint
) as $$
  with ranked as (
    select
      r.*,
      row_number() over (partition by r.player_id order by r.match_date desc, r.fixture_id desc) as recency_rank
    from player_match_ratings r
    where r.provider = 'sportmonks'
  ),
  recent as (
    select * from ranked where recency_rank <= 5
  ),
  agg as (
    select
      recent.player_id,
      avg(recent.rating) as avg_rating,
      count(*) as rated_matches,
      (array_agg(recent.competition_id order by recent.match_date desc))[1] as latest_competition_id,
      (array_agg(recent.competition_name order by recent.match_date desc))[1] as latest_competition_name
    from recent
    group by recent.player_id
  )
  select
    p.id as player_id,
    p.name as player_name,
    p.club,
    agg.latest_competition_id as competition_id,
    agg.latest_competition_name as competition_name,
    round(agg.avg_rating, 2) as avg_rating,
    agg.rated_matches
  from agg
  join players p on p.id = agg.player_id
  where agg.rated_matches >= min_appearances
    and agg.avg_rating >= min_avg_rating
    and (filter_competition_ids is null or agg.latest_competition_id = any(filter_competition_ids))
  order by agg.avg_rating desc, agg.rated_matches desc
  limit result_limit;
$$ language sql stable security invoker;
