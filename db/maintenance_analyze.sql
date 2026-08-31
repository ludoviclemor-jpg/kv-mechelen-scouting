-- ANALYZE alone (previous version of this file) did not fix it —
-- confirmed live, the "new players" count query still errored out
-- afterward. The real cause is more likely dead-tuple bloat: today's
-- bulk UPDATEs (75k+ of 177k player rows) leave old row versions behind
-- under Postgres's MVCC model, which forces expensive heap visibility
-- checks on every row a count touches until VACUUM cleans them up and
-- refreshes the visibility map — ANALYZE alone only refreshes planner
-- statistics, it doesn't reclaim any of that. VACUUM (not VACUUM FULL —
-- that takes a heavy exclusive lock) runs safely alongside normal
-- reads/writes.
vacuum analyze players;
vacuum analyze player_scouting_state;
vacuum analyze player_international_callups;
