-- PART 3b — run this alone, after part 3a succeeds.
create index if not exists idx_players_club_unaccented_trgm on players using gin (club_unaccented gin_trgm_ops);
