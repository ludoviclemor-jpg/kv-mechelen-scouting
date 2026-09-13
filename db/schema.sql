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
-- Trigram index (2026-09-13) — searchPlayers() ORs an ILIKE on `league`
-- together with name_unaccented/club_unaccented; without a trigram
-- index here too, Postgres's planner abandons index use for the whole
-- OR and sequential-scans the table, confirmed live to time out.
create index if not exists idx_players_league_trgm on players using gin (league gin_trgm_ops);
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

-- African Debutants' "Debut Minutes" column (docs/DEBUTANTS_MINUTES.md
-- if this grows a doc; for now see the feature's own git history) — real
-- per-match minutes played in the specific debut fixture, cross-
-- referenced from `matches`' full lineup JSON by matching the debutant's
-- own competition_id + debut_date against a match in that competition on
-- that day, then finding their scoutastic_player_id in that match's
-- combined home+away lineup. Confirmed live (2026-09-02): only ~10.6% of
-- current debutants have a real match synced for their exact debut date
-- (`matches` isn't an exhaustive historical archive — see docs/EXPLORE.md) —
-- genuinely partial, so this returns no row (never a fabricated 0) for
-- the rest; the frontend shows "—" for those. Takes the caller's already-
-- filtered player id list rather than scanning every debutant, reusing
-- the real idx_matches_competition/idx_matches_date indexes.
create or replace function debutant_match_minutes(player_ids text[])
returns table (player_id text, minutes_played integer)
language sql stable security invoker as $$
  select distinct on (p.id)
    p.id as player_id,
    (elem->>'minutesPlayed')::integer as minutes_played
  from players p
  join matches m
    on m.competition_id = p.competition_id
   and m.date >= p.debut_date::timestamptz
   and m.date < (p.debut_date + 1)::timestamptz
  cross join lateral jsonb_array_elements(m.home_team_players || m.away_team_players) as elem
  where p.id = any(player_ids)
    and p.debut_date is not null
    and p.competition_id is not null
    and elem->>'id' = p.scoutastic_player_id
  order by p.id, m.date desc;
$$;

-- Partial indexes so the two JSONB-heavy functions below don't need to
-- scan the whole 190k+ row `players` table — confirmed live (2026-09-03):
-- an unindexed `injury_history != '[]'` scan took 8-18s / timed out;
-- with this index, well under 1s. Same "index matches the exact WHERE
-- clause" pattern already proven for idx_players_loan_watch.
create index if not exists idx_players_has_injury_history on players(id) where active = true and injury_history != '[]'::jsonb;
create index if not exists idx_players_has_market_value_history on players(id) where active = true and market_value_history != '[]'::jsonb;

-- Injury Tracker (dashboard tool, 2026-09-03) — real currently-injured
-- players, from the same injury_history synced for the Career tab
-- (docs/PLAYER_PROFILE.md's "Career section"). "Currently injured" =
-- their most recent injury entry has no `to` date (still ongoing per
-- SCOUTASTIC, confirmed real — see that doc) or a `to` date that hasn't
-- passed yet. Coverage is genuinely sparse today (injury_history only
-- backfills on a player's next crawl, same as performance_seasons/
-- market_value_history) — this returns exactly what's real, nothing
-- padded to look more complete.
create or replace function currently_injured_players(filter_competition_ids text[] default null)
returns table (
  player_id text,
  injury_description text,
  injury_from date,
  injury_to date
) as $$
  select p.id as player_id, latest.description, latest.from_date, latest.to_date
  from players p
  cross join lateral (
    select
      elem->>'description' as description,
      (elem->>'from')::date as from_date,
      nullif(elem->>'to', '')::date as to_date
    from jsonb_array_elements(p.injury_history) as elem
    order by (elem->>'from')::date desc nulls last
    limit 1
  ) as latest
  where p.active = true
    and p.injury_history != '[]'::jsonb
    and (filter_competition_ids is null or p.competition_id = any(filter_competition_ids))
    and (latest.to_date is null or latest.to_date >= current_date)
  order by latest.from_date desc nulls last;
$$ language sql stable security invoker;

-- Market Value Movers (dashboard tool, 2026-09-03) — real biggest
-- risers/fallers, from the same market_value_history synced for the
-- Career tab. `direction` controls whether only positive or only
-- negative changes are returned (a "fallers" list showing risers mixed
-- in wouldn't make sense) — 'risers' or 'fallers'. Baseline is the
-- oldest dated point still within `lookback_days` of today; a player
-- needs a real point that old to get a comparison at all (never
-- fabricates a baseline).
create or replace function market_value_movers(
  filter_competition_ids text[] default null,
  lookback_days integer default 180,
  direction text default 'risers',
  result_limit integer default 20
)
returns table (
  player_id text,
  baseline_value numeric,
  baseline_date date,
  latest_value numeric,
  latest_date date,
  change_pct numeric
) as $$
  with points as (
    select
      p.id as player_id,
      (elem->>'value')::numeric as value,
      (elem->>'date')::date as date
    from players p
    cross join lateral jsonb_array_elements(p.market_value_history) as elem
    where p.active = true
      and p.market_value_history != '[]'::jsonb
      and (filter_competition_ids is null or p.competition_id = any(filter_competition_ids))
  ),
  latest as (
    select distinct on (player_id) player_id, value as latest_value, date as latest_date
    from points
    order by player_id, date desc
  ),
  baseline as (
    select distinct on (player_id) player_id, value as baseline_value, date as baseline_date
    from points
    where date <= current_date - lookback_days
    order by player_id, date desc
  ),
  changes as (
    select
      l.player_id,
      b.baseline_value,
      b.baseline_date,
      l.latest_value,
      l.latest_date,
      round(((l.latest_value - b.baseline_value) / nullif(b.baseline_value, 0)) * 100, 1) as change_pct
    from latest l
    join baseline b using (player_id)
    where b.baseline_value > 0 and l.latest_date > b.baseline_date
  )
  select player_id, baseline_value, baseline_date, latest_value, latest_date, change_pct
  from changes
  where (direction = 'risers' and change_pct > 0) or (direction = 'fallers' and change_pct < 0)
  order by case when direction = 'risers' then change_pct end desc nulls last,
           case when direction = 'fallers' then change_pct end asc nulls last
  limit result_limit;
$$ language sql stable security invoker;

-- ============================================================
-- Per-scout privacy + match reports / saved searches / next actions
-- (redesign pass, 2026-09-08 — see docs/POSTGRES_PERSISTENCE.md)
--
-- Previously `shortlists`/`player_scouting_state` were shared across
-- every signed-in scout by design (see the old comment this replaces).
-- That's no longer the intended model: a scout's shortlists, statuses,
-- notes, match reports, saved searches and next actions are now private
-- to them. `favorite_competitions` (Explore's competition bookmarks) is
-- deliberately left shared — it's a browse convenience, not scouting
-- work product, and nothing in this pass asked for it to change.
--
-- Backfill note: at the time this migration was written, exactly one
-- real user existed (confirmed live), so "the earliest-created user"
-- backfill below is exact, not a guess — re-running this on a project
-- with more users would silently assign every pre-existing shared row to
-- one of them, so don't re-run the UPDATE lines below a second time (the
-- `where owner_id is null` guard already makes them a no-op after the
-- first successful run).
-- ============================================================

alter table shortlists add column if not exists owner_id uuid references auth.users(id) on delete cascade;
update shortlists set owner_id = (select id from auth.users order by created_at asc limit 1) where owner_id is null;
alter table shortlists alter column owner_id set not null;
alter table shortlists alter column owner_id set default auth.uid();
create index if not exists idx_shortlists_owner on shortlists(owner_id);

alter table player_scouting_state add column if not exists owner_id uuid references auth.users(id) on delete cascade;
update player_scouting_state set owner_id = (select id from auth.users order by created_at asc limit 1) where owner_id is null;
alter table player_scouting_state alter column owner_id set not null;
alter table player_scouting_state alter column owner_id set default auth.uid();
-- Was a single-column PK (one shared row per player); now composite so
-- each scout holds their own independent status/notes for the same
-- player.
alter table player_scouting_state drop constraint if exists player_scouting_state_pkey;
alter table player_scouting_state add primary key (owner_id, scoutastic_player_id);

-- ============================================================
-- Recruitment pipeline expansion (2026-09-11) — from a flat 5-value
-- status (not_assessed/monitoring/interested/priority/rejected) to the
-- full 10-stage pipeline. The check constraint must be widened *before*
-- any row is remapped to a new value name — the old constraint doesn't
-- know 'unwatched'/'data_identified'/'video' and rejects the UPDATE
-- otherwise (confirmed live: this ordering bug was caught by a real
-- failed migration attempt). Safe to re-run: the UPDATEs only ever touch
-- rows still holding an old value, so they're a no-op once migrated.
-- ============================================================
alter table player_scouting_state drop constraint if exists player_scouting_state_status_check;
alter table player_scouting_state add constraint player_scouting_state_status_check
  check (status in ('not_assessed', 'monitoring', 'interested', 'unwatched', 'data_identified', 'video', 'live', 'shortlist', 'priority', 'discuss', 'target', 'rejected', 'signed'));

update player_scouting_state set status = 'unwatched' where status = 'not_assessed';
update player_scouting_state set status = 'data_identified' where status = 'monitoring';
update player_scouting_state set status = 'video' where status = 'interested';
-- 'priority' and 'rejected' keep the same slug/meaning — no remap needed.

-- Now that no row holds an old value, narrow the constraint to just the
-- real 10-stage set (drops the three old value names from the allowlist).
alter table player_scouting_state drop constraint if exists player_scouting_state_status_check;
alter table player_scouting_state add constraint player_scouting_state_status_check
  check (status in ('unwatched', 'data_identified', 'video', 'live', 'shortlist', 'priority', 'discuss', 'target', 'rejected', 'signed'));
alter table player_scouting_state alter column status set default 'unwatched';

-- Match-report history (item 5 of the redesign brief) — a scout can now
-- keep many dated reports per player instead of one shared status/notes
-- summary. `match_id` is a soft, optional link into `matches` (nullable,
-- on delete set null) since a live-scouted match is very often not one
-- SCOUTASTIC has crawled at all — `opponent`/`match_date` are free text/
-- date so a report never depends on match sync coverage.
create table if not exists match_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scoutastic_player_id text not null,
  match_id text references matches(id) on delete set null,
  opponent text not null default '',
  match_date date,
  scouting_type text not null default 'live' check (scouting_type in ('live', 'video')),
  minutes_watched integer check (minutes_watched is null or minutes_watched >= 0),
  position_played text,
  strengths text not null default '',
  weaknesses text not null default '',
  overall_rating integer check (overall_rating is null or overall_rating between 1 and 10),
  follow_up_action text not null default 'no_action'
    check (follow_up_action in ('watch_again', 'report_to_staff', 'sign_recommendation', 'discard', 'no_action')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_match_reports_owner on match_reports(owner_id);
create index if not exists idx_match_reports_player on match_reports(owner_id, scoutastic_player_id);
create index if not exists idx_match_reports_date on match_reports(match_date desc);

-- Saved search profiles (item 6) — the Players page's filter state,
-- named and reusable. `filters` stores the same shape the page already
-- keeps in its own React state/URL query, so no separate parsing layer.
create table if not exists saved_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_saved_searches_owner on saved_searches(owner_id);

-- "My Next Actions" (item 8) — small, scout-owned to-dos, optionally
-- linked to a player. Not a task-management system: no priority levels,
-- assignees, or sub-tasks, just what the brief actually asked for.
create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null,
  action_type text not null default 'other'
    check (action_type in ('review_player', 'finish_report', 'research_candidate', 'other')),
  scoutastic_player_id text,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_action_items_owner on action_items(owner_id);
create index if not exists idx_action_items_due on action_items(due_date);

drop trigger if exists trg_match_reports_updated_at on match_reports;
create trigger trg_match_reports_updated_at
  before update on match_reports
  for each row execute function set_updated_at();

drop trigger if exists trg_saved_searches_updated_at on saved_searches;
create trigger trg_saved_searches_updated_at
  before update on saved_searches
  for each row execute function set_updated_at();

drop trigger if exists trg_action_items_updated_at on action_items;
create trigger trg_action_items_updated_at
  before update on action_items
  for each row execute function set_updated_at();

-- ============================================================
-- Recruitment-platform foundations (2026-09-11 pass) — schema only.
-- Populating scripts/UI for each of these lands in follow-up passes; see
-- the architecture summary in the conversation this was written from.
-- Nothing here depends on IMPECT credentials existing yet.
-- ============================================================

-- Match watching (spec item "Phase 11"). Private per scout — a plan to
-- watch, or a record of having watched, a match for a specific player.
-- `match_id`/`report_id` are soft, nullable links (a planned watch has no
-- report yet; a live-scouted match is often not one SCOUTASTIC crawled).
create table if not exists player_watch_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scoutastic_player_id text not null,
  match_id text references matches(id) on delete set null,
  watch_type text not null check (watch_type in ('planning', 'live', 'video')),
  watch_date date,
  notes text not null default '',
  report_id uuid references match_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_player_watch_history_owner on player_watch_history(owner_id);
create index if not exists idx_player_watch_history_player on player_watch_history(owner_id, scoutastic_player_id);

drop trigger if exists trg_player_watch_history_updated_at on player_watch_history;
create trigger trg_player_watch_history_updated_at
  before update on player_watch_history
  for each row execute function set_updated_at();

-- Structured player alerts ("Phase 9"). Facts about a player (contract
-- window entered, call-up received, market value moved, ...) are not
-- scouting opinion, so the alert rows themselves are shared/read-only
-- for every authenticated scout — same convention as `players`/`matches`.
-- Read/unread state is genuinely personal (two scouts don't share an
-- inbox), so that lives in the separate `alert_read_state` table below.
--
-- Only a subset of `type` really has a real, generatable source today —
-- see the check constraint's comment. The generator script (reads
-- players/contract_expiry, market_value_history, injury_history,
-- player_international_callups, player_scouting_state) is a follow-up
-- piece of work, not built in this pass; this table is additive/inert
-- until that script exists and starts inserting rows.
create table if not exists player_alerts (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references players(id) on delete cascade,
  type text not null check (type in (
    -- generatable today, from data already synced:
    'match_today', 'first_callup', 'first_senior_callup',
    'contract_12_months', 'contract_6_months', 'market_value_change',
    'injury', 'return_from_injury', 'status_change',
    -- schema-ready, not generatable without a source that doesn't exist
    -- yet (no transfer feed, no rumour source, no IMPECT connection) —
    -- kept in the constraint so a future generator never needs a schema
    -- change, but nothing writes these types today:
    'transfer', 'loan', 'strong_performance', 'impect_percentile_change', 'new_rumour'
  )),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  title text not null,
  description text not null default '',
  source text not null, -- e.g. 'players.contract_expiry', 'player_international_callups' — which real table/sync produced this, for traceability
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_player_alerts_player on player_alerts(player_id);
create index if not exists idx_player_alerts_created on player_alerts(created_at desc);
create index if not exists idx_player_alerts_type on player_alerts(type);

create table if not exists alert_read_state (
  alert_id uuid not null references player_alerts(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (alert_id, owner_id)
);

-- Status change log ("Phase 13") — append-only, one row per real status
-- transition. Owner-scoped like player_scouting_state itself (each scout
-- now has their own independent status per player, so their history of
-- changing it is equally their own). Written by the frontend right after
-- a successful player_scouting_state write — see
-- src/lib/persistence/supabaseProvider.ts's setPlayerStatus. `old_status`
-- is null only for a player's very first status row (never had one
-- before, e.g. straight to 'shortlist' without passing through the
-- default 'unwatched' explicitly).
create table if not exists player_status_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scoutastic_player_id text not null,
  old_status text,
  new_status text not null,
  note text not null default '',
  changed_at timestamptz not null default now()
);
create index if not exists idx_player_status_history_lookup on player_status_history(owner_id, scoutastic_player_id, changed_at desc);

-- KV Mechelen role profiles ("Phase 4/19") — configuration only, no
-- scoring logic and no seeded weights yet. Deliberately NOT seeded with
-- example weights against packing/progressive-passing/etc.: those are
-- IMPECT metrics, and none of that data is connected yet (see the
-- architecture summary) — seeding weights against metrics that don't
-- exist would be exactly the "invented data" this project's standing
-- rules forbid. Once a real metrics source is connected, weight rows can
-- be added referencing that source's real field names. Shared/global
-- config (like favorite_competitions), not per-scout — there is no
-- admin-only role distinct from "authenticated scout" yet, a known
-- limitation until a real role system exists.
create table if not exists role_profiles (
  id text primary key, -- slug, e.g. 'progressive_cb'
  label text not null, -- e.g. 'Progressive CB'
  position_group text not null check (position_group in ('GK', 'CB', 'FB_WB', 'DM', 'CM', 'AM', 'WINGER', 'ST')),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists role_profile_weights (
  role_id text not null references role_profiles(id) on delete cascade,
  metric_key text not null, -- provider-namespaced, e.g. 'impect.packing_per90' once a real provider supplies it
  weight numeric not null check (weight > 0 and weight <= 1),
  primary key (role_id, metric_key)
);

drop trigger if exists trg_role_profiles_updated_at on role_profiles;
create trigger trg_role_profiles_updated_at
  before update on role_profiles
  for each row execute function set_updated_at();

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

-- ============================================================
-- Position-specific player ratings (2026-09-11+) — standalone, no
-- dependency on the per-scout-privacy migration. Stores the output of
-- the deterministic TypeScript-repo-conventions scoring engine
-- (scripts/lib/scoring/, invoked via scripts/calculate-player-ratings.mjs)
-- — never computed in the frontend/browser. See docs/SCORING_MODEL.md
-- for the full methodology.
--
-- One row per (player, competition, model version combination that
-- produced it) — recalculating overwrites the same row (latest-only,
-- not a full history table; `calculated_at`/`model_version` are enough
-- to know whether a rating is stale, which is this project's real cache-
-- invalidation need today). `scoutastic_player_id` is the real bridge to
-- this project's own player database — confirmed live
-- (impect_players.transfermarkt_id = players.scoutastic_player_id for
-- real matched players) — nullable since not every Impect player has
-- been crawled into `players` yet.
-- ============================================================
create table if not exists player_ratings (
  impect_player_id integer not null,
  iteration_id integer not null references impect_competitions(iteration_id) on delete cascade,
  scoutastic_player_id text,
  model_version text not null,
  calculated_at timestamptz not null default now(),
  ratable boolean not null,
  reason text, -- why not ratable, when ratable = false
  current_level numeric,
  current_level_band text,
  potential numeric,
  potential_range_low numeric,
  potential_range_high numeric,
  overall_percentile integer,
  confidence_score integer,
  confidence_label text check (confidence_label is null or confidence_label in ('Low', 'Medium', 'High')),
  confidence_reasons jsonb not null default '[]',
  context jsonb not null default '{}', -- position, positionGroup, role, season, competition, minutes, cohortSize, cohortLevel, age
  pillars jsonb not null default '[]',
  strengths jsonb not null default '[]',
  weaknesses jsonb not null default '[]',
  development_priorities jsonb not null default '[]',
  explanation text,
  warnings jsonb not null default '[]',
  primary key (impect_player_id, iteration_id)
);
create index if not exists idx_player_ratings_scoutastic on player_ratings(scoutastic_player_id);

-- ============================================================
-- SkillCorner physical-data integration (2026-09-11+) — a genuinely
-- separate API/account from Impect (www.skillcorner.com, HTTP Basic
-- Auth, confirmed live against docs/skillcorner-openapi.json). Added
-- specifically because Impect's own KPI/Score catalogs contain no real
-- speed/sprint/distance data — SkillCorner is the actual source for
-- that, per explicit instruction to use only real SkillCorner data for
-- player physical profiles, never a proxy.
--
-- SkillCorner has no cross-reference id to this project's own player
-- space (no transfermarkt_id equivalent on its Player object — see
-- docs/skillcorner-openapi.json's Player schema) — the real bridge used
-- here is an exact (name, birthdate) match against `players`, confirmed
-- live against two real KV Mechelen players (Benito Raman, Rob Schoofs)
-- before this table was built. A SkillCorner player who doesn't match
-- any row in `players` is simply never written here — no fabricated or
-- guessed bridge.
--
-- Scale note: same shape as the Impect integration — 1541 real
-- competition editions confirmed live, far too much for one run, so
-- `skillcorner_sync_queue` is the same resumable nulls-first crawl queue
-- as `impect_sync_queue` / `scoutastic_teams`.
-- ============================================================

create table if not exists skillcorner_competition_editions (
  id integer primary key, -- SkillCorner's own competition_edition id
  competition_id integer not null,
  competition_name text not null,
  area text,
  season_id integer,
  season_name text,
  gender text,
  age_group text,
  last_synced_at timestamptz
);
create index if not exists idx_skillcorner_competition_editions_competition on skillcorner_competition_editions(competition_id);

create table if not exists skillcorner_sync_queue (
  competition_edition_id integer primary key references skillcorner_competition_editions(id) on delete cascade,
  last_synced_at timestamptz
);
create index if not exists idx_skillcorner_sync_queue_last_synced on skillcorner_sync_queue(last_synced_at nulls first);

-- One row per (matched player, competition edition) — season-aggregate,
-- per-90-normalized real physical metrics (average_per=p90, confirmed
-- live). Field names mirror SkillCorner's own real response keys
-- (docs/skillcorner-openapi.json's /physical/ schema) so there is never
-- any ambiguity about what a column actually measures.
create table if not exists skillcorner_player_physical (
  scoutastic_player_id text not null references players(scoutastic_player_id) on delete cascade,
  competition_edition_id integer not null references skillcorner_competition_editions(id) on delete cascade,
  skillcorner_player_id integer not null,
  competition_name text,
  season_name text,
  position text, -- SkillCorner's own acronym, e.g. 'CB', 'LW' — not this project's own position taxonomy
  position_group text, -- SkillCorner's own 5-group taxonomy: CentralDefender | FullBack | Midfield | WideAttacker | CenterForward
  count_match integer not null,
  minutes_avg_per_match numeric,
  total_distance_p90 numeric,
  total_metersperminute numeric,
  running_distance_p90 numeric,
  hsr_distance_p90 numeric, -- high-speed running
  hsr_count_p90 numeric,
  sprint_distance_p90 numeric,
  sprint_count_p90 numeric,
  hi_distance_p90 numeric, -- high-intensity (hsr + sprint)
  hi_count_p90 numeric,
  medaccel_count_p90 numeric,
  highaccel_count_p90 numeric,
  meddecel_count_p90 numeric,
  highdecel_count_p90 numeric,
  psv99 numeric, -- peak sprint velocity, 99th-percentile-smoothed
  psv99_top5 numeric,
  peak_velocity numeric,
  peak_velocity_top3 numeric,
  updated_at timestamptz not null default now(),
  primary key (scoutastic_player_id, competition_edition_id)
);
create index if not exists idx_skillcorner_player_physical_player on skillcorner_player_physical(scoutastic_player_id);
create index if not exists idx_skillcorner_player_physical_edition on skillcorner_player_physical(competition_edition_id);
create index if not exists idx_player_ratings_calculated_at on player_ratings(calculated_at);

-- ============================================================
-- Global search fix (2026-09-11) — accent-insensitive matching. See
-- db/migrations/2026-09-11_part1_core.sql, _part2_players_columns.sql, _part3_players_indexes.sql
-- for the full investigation/rationale. `unaccent` is Postgres's own
-- real contrib extension; trigger-maintained (not `generated always as`)
-- because `unaccent()` is STABLE, not IMMUTABLE.
-- ============================================================
create extension if not exists unaccent;

alter table players add column if not exists name_unaccented text;
alter table players add column if not exists club_unaccented text;

create or replace function players_set_unaccented()
returns trigger as $$
begin
  new.name_unaccented := unaccent(coalesce(new.name, ''));
  new.club_unaccented := unaccent(coalesce(new.club, ''));
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_players_set_unaccented on players;
create trigger trg_players_set_unaccented
  before insert or update of name, club on players
  for each row execute function players_set_unaccented();

-- Backfill for pre-existing rows: node scripts/backfill-unaccented-columns.mjs
-- (a single UPDATE across the real ~180k-row table times out the SQL
-- Editor — confirmed live).

create index if not exists idx_players_name_unaccented_trgm on players using gin (name_unaccented gin_trgm_ops);
create index if not exists idx_players_club_unaccented_trgm on players using gin (club_unaccented gin_trgm_ops);

-- ============================================================
-- To-Do enhancement (2026-09-11) — extends the existing, already
-- owner-scoped `action_items` table (powers "My Next Actions" on the
-- dashboard and the player-profile "Next action"/"+ To-Do" button)
-- instead of creating a parallel table.
-- ============================================================
alter table action_items add column if not exists priority text not null default 'normal'
  check (priority in ('low', 'normal', 'high'));
alter table action_items add column if not exists notes text;
create index if not exists idx_action_items_priority on action_items(priority);

-- ============================================================
-- Shadow XI (2026-09-11) — one row per shortlist. Same owner-scoped RLS
-- shape as match_reports/saved_searches/action_items — a scout's Shadow
-- XI is exactly as private as their shortlists and to-dos already are.
-- `slots` is `{ [slotKey]: scoutastic_player_id }`, a flat jsonb map
-- (not one column per position) because the formation's slot keys are
-- configurable — see src/lib/shadow-xi/formations.ts — and this must
-- not need a migration every time a new formation is added.
-- ============================================================
create table if not exists shadow_xi (
  shortlist_id uuid primary key references shortlists(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  formation_id text not null default '4-2-3-1',
  slots jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists idx_shadow_xi_owner on shadow_xi(owner_id);

drop trigger if exists trg_shadow_xi_updated_at on shadow_xi;
create trigger trg_shadow_xi_updated_at
  before update on shadow_xi
  for each row execute function set_updated_at();
