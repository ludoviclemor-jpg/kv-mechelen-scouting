/**
 * The Sportmonks leagues in scope for this TEST integration — deliberately
 * a plain array, not hardcoded elsewhere, so adding a league later (once
 * the Sportmonks plan is upgraded past the free tier's 2-league limit) is
 * a one-entry addition here, not a code change. See
 * docs/SPORTMONKS_INTEGRATION.md.
 *
 * **Real finding that shaped this (2026-09-01): `players.competition_id`
 * is NOT a reliable way to scope "plays in this domestic league" —** it
 * records whichever competition the player was *discovered through*
 * during the Scoutastic crawl, which is very often a European
 * qualifying round (e.g. `competition_id: "UNLB"`), not the domestic
 * league, even for a player whose `club` field correctly says "Celtic
 * FC". Confirmed directly: real players Kieran Tierney (Celtic) and
 * Patrick Pentz (Brøndby IF) both carry `competition_id: "UNLB"`, not
 * `SC1`/`DK1`. Filtering the matching candidate pool by competition_id
 * (an earlier version of this sync did exactly that) silently missed
 * real, correctly-clubbed players. `club` is the reliable signal
 * instead — confirmed live: `.eq("club", "Celtic FC")` alone returns a
 * real, correctly-sized 27-player squad spanning several different
 * competition_id values.
 *
 * `clubAliases` maps each Sportmonks team name (as returned by
 * `/standings/seasons/{id}?include=participant`, confirmed real
 * 2026-09-01) to the exact `players.club` string Scoutastic uses for
 * that same real club — built by comparing the real team list from both
 * providers, not fabricated. Needed because the two providers spell some
 * clubs differently: usually just accents (ö/ø) or an "FC"/"AC" prefix
 * Scoutastic adds and Sportmonks omits, but at least one case is a
 * genuine translation ("FC København" vs "FC Copenhagen") that no
 * generic string-normalization could bridge on its own.
 */
export const SPORTMONKS_LEAGUES = [
  {
    sportmonksLeagueId: 271,
    name: "Danish Superliga",
    clubAliases: {
      AGF: "Aarhus GF",
      "Brøndby IF": "Bröndby IF",
      "FC København": "FC Copenhagen",
      "FC Midtjylland": "FC Midtjylland",
      Horsens: "AC Horsens",
      "Lyngby Boldklub": "Lyngby Boldklub",
      Nordsjælland: "FC Nordsjaelland",
      "Odense BK": "Odense Boldklub",
      "Randers FC": "Randers FC",
      "Silkeborg IF": "Silkeborg IF",
      "Sønderjyske Fodbold": "Sönderjyske Fodbold",
      "Viborg FF": "Viborg FF",
    },
  },
  {
    sportmonksLeagueId: 501,
    name: "Scottish Premiership",
    clubAliases: {
      Aberdeen: "Aberdeen FC",
      Celtic: "Celtic FC",
      Dundee: "Dundee FC",
      "Dundee United": "Dundee United FC",
      Falkirk: "Falkirk FC",
      Hearts: "Heart of Midlothian FC",
      Hibernian: "Hibernian FC",
      Kilmarnock: "Kilmarnock FC",
      Motherwell: "Motherwell FC",
      Rangers: "Rangers FC",
      "St. Johnstone": "St. Johnstone FC",
      "St. Mirren": "St. Mirren FC",
    },
  },
];
