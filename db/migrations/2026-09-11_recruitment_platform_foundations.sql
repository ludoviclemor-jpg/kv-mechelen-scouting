-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Additive + one value-remap on an existing column (player_scouting_state.status,
-- only 2 rows in production as of writing) -- nothing is dropped or destroyed.
-- Source of truth is db/schema.sql + db/rls_policies.sql (this file is a
-- copy-paste convenience of just the new blocks added there on 2026-09-11).

-- ==== status pipeline expansion (db/schema.sql) ====

-- ============================================================
-- Recruitment pipeline expansion (2026-09-11) — from a flat 5-value
-- status (not_assessed/monitoring/interested/priority/rejected) to the
-- full 10-stage pipeline. One-time value remap for whatever rows already
-- exist, then the check constraint and default are widened/updated.
-- Safe to re-run: the UPDATE only ever touches rows still holding an old
-- value, so it's a no-op once already migrated.
-- ============================================================
update player_scouting_state set status = 'unwatched' where status = 'not_assessed';
update player_scouting_state set status = 'data_identified' where status = 'monitoring';
update player_scouting_state set status = 'video' where status = 'interested';
-- 'priority' and 'rejected' keep the same slug/meaning — no remap needed.

alter table player_scouting_state drop constraint if exists player_scouting_state_status_check;
alter table player_scouting_state add constraint player_scouting_state_status_check
  check (status in ('unwatched', 'data_identified', 'video', 'live', 'shortlist', 'priority', 'discuss', 'target', 'rejected', 'signed'));
alter table player_scouting_state alter column status set default 'unwatched';


-- ==== new tables (db/schema.sql) ====

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

-- ==== RLS policies (db/rls_policies.sql) ====

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

