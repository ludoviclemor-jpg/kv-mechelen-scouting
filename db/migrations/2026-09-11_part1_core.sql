-- PART 1 of 3 — run this first. Fast, no touch of the large `players`
-- table at all (extensions, action_items columns, and the brand-new
-- shadow_xi table). Safe to run on its own; nothing here depends on
-- part 2 or 3.

create extension if not exists pgcrypto;
create extension if not exists unaccent;

-- To-Do enhancement — extends the existing, already owner-scoped
-- action_items table (powers "My Next Actions" on the dashboard and the
-- player-profile "+ To-Do" button) instead of creating a parallel table.
alter table action_items add column if not exists priority text not null default 'normal'
  check (priority in ('low', 'normal', 'high'));
alter table action_items add column if not exists notes text;
create index if not exists idx_action_items_priority on action_items(priority);

-- Shadow XI — one row per shortlist. Same owner-scoped RLS shape as
-- match_reports/saved_searches/action_items — a scout's Shadow XI is
-- exactly as private as their shortlists and to-dos already are.
create table if not exists shadow_xi (
  shortlist_id uuid primary key references shortlists(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  formation_id text not null default '4-2-3-1',
  slots jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists idx_shadow_xi_owner on shadow_xi(owner_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_shadow_xi_updated_at on shadow_xi;
create trigger trg_shadow_xi_updated_at
  before update on shadow_xi
  for each row execute function set_updated_at();

alter table shadow_xi enable row level security;
drop policy if exists "owner can read shadow_xi" on shadow_xi;
create policy "owner can read shadow_xi" on shadow_xi
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner can insert shadow_xi" on shadow_xi;
create policy "owner can insert shadow_xi" on shadow_xi
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "owner can update shadow_xi" on shadow_xi;
create policy "owner can update shadow_xi" on shadow_xi
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owner can delete shadow_xi" on shadow_xi;
create policy "owner can delete shadow_xi" on shadow_xi
  for delete to authenticated using (owner_id = auth.uid());
