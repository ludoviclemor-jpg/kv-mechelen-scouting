-- Adds the KV Mechelen Fit result to the existing player_ratings table
-- — one new nullable jsonb column, same convention as pillars/strengths/
-- weaknesses already stored there. Never a private/licensed data leak:
-- this stores the *computed result* (scores + which of the club's own
-- configured qualities/requirements were checked), not raw scouting
-- criteria text — the actual profile config lives in
-- scripts/lib/scoring/config/kvMechelenProfile.mjs (source-controlled,
-- not published as a standalone public data file).
alter table player_ratings add column if not exists kv_fit jsonb;
