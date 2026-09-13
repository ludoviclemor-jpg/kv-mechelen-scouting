-- PART 4 of 4 — run after part 3. A small helper function for
-- scripts/backfill-unaccented-columns.mjs: a real, plain `UPDATE`
-- (never an INSERT), so it's impossible to hit a NOT NULL violation on
-- an unrelated column the way a bulk `.upsert()` can (confirmed live:
-- upsert took the INSERT path for at least one row and failed on
-- `scoutastic_player_id`, a column the backfill never touches). Called
-- only via the service_role key from that Node script — never exposed
-- to the browser.
create or replace function backfill_players_unaccented(ids text[], names_unaccented text[], clubs_unaccented text[])
returns void as $$
  update players
  set name_unaccented = u.name_unaccented, club_unaccented = u.club_unaccented
  from unnest(ids, names_unaccented, clubs_unaccented) as u(id, name_unaccented, club_unaccented)
  where players.id = u.id;
$$ language sql;
