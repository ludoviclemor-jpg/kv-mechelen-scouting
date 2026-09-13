-- PART 3a — run this alone (just this one statement). The data is
-- already backfilled (real values in every row now, not empty like the
-- first attempt), so this will take real time to build — that's
-- expected and fine, let it run.
create index if not exists idx_players_name_unaccented_trgm on players using gin (name_unaccented gin_trgm_ops);
