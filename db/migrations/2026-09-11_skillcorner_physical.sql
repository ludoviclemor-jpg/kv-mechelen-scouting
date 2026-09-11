-- STANDALONE migration — new SkillCorner tables only. Does NOT touch,
-- depend on, or require any earlier migration to have succeeded first.
-- Safe to run on its own, in the Supabase SQL Editor, right now.
--
-- Purely additive: three brand-new tables (skillcorner_competition_editions,
-- skillcorner_sync_queue, skillcorner_player_physical), nothing existing
-- is altered or dropped.

create extension if not exists pgcrypto;

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

-- ==== RLS policies (from db/rls_policies.sql) ====

alter table skillcorner_competition_editions enable row level security;
drop policy if exists "authenticated can read skillcorner_competition_editions" on skillcorner_competition_editions;
create policy "authenticated can read skillcorner_competition_editions" on skillcorner_competition_editions
  for select to authenticated using (true);

alter table skillcorner_player_physical enable row level security;
drop policy if exists "authenticated can read skillcorner_player_physical" on skillcorner_player_physical;
create policy "authenticated can read skillcorner_player_physical" on skillcorner_player_physical
  for select to authenticated using (true);

-- skillcorner_sync_queue is an internal crawl-queue cache, never read by
-- the frontend — RLS enabled with no policy at all (denies every role
-- including authenticated), same convention as impect_sync_queue.
alter table skillcorner_sync_queue enable row level security;
