-- PART 2 of 3 — run after part 1. Adds two nullable columns to
-- `players` plus the trigger that keeps them correct going forward.
-- Adding a nullable column with no default is a metadata-only change in
-- Postgres (no table rewrite) even on a real ~180k-row table — this
-- should be fast. Run part 3 (the indexes) separately afterward.

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
