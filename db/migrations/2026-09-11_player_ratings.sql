-- STANDALONE migration — new player_ratings table only. Does NOT touch
-- or depend on the earlier per-scout-privacy migration. Safe to run on
-- its own; run AFTER db/migrations/2026-09-11_impect_tables.sql (this
-- table references impect_competitions).

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
create index if not exists idx_player_ratings_calculated_at on player_ratings(calculated_at);

-- ==== RLS policy (from db/rls_policies.sql) ====

-- Player ratings — read-only for authenticated, same convention as the
-- other impect_* tables. Written only by
-- scripts/calculate-player-ratings.mjs's service_role key.
alter table player_ratings enable row level security;
drop policy if exists "authenticated can read player_ratings" on player_ratings;
create policy "authenticated can read player_ratings" on player_ratings
  for select to authenticated using (true);
