/**
 * Real, cited competition-strength calibration data — replaces the
 * earlier 2-entry placeholder (only Jupiler Pro League + Challenger Pro
 * League were ever configured; every other one of Impect's real 187
 * competition names silently fell back to the SAME weak default,
 * meaning even the Premier League or LaLiga were calibrated as if they
 * were an unranked lower league — confirmed live: under that default,
 * no raw cohort-percentile score could ever calibrate above ~90 even
 * for a mathematically perfect 100th-percentile player, because the
 * default multiplier/offset made 90+ algebraically unreachable for any
 * competition other than Belgium's own).
 *
 * Two real, independently published sources, fetched live 2026-09-11:
 *
 * 1. IFFHS "Strongest Leagues" ranking — real points for the world's
 *    top ~20 domestic leagues (https://financefootball.com/en/2026/01/21/top-20-best-football-leagues-in-the-world-2025/,
 *    sourced from IFFHS). Used directly wherever a league is on that
 *    list.
 * 2. UEFA country coefficients — real 5-year performance-based ranking
 *    for all 55 UEFA member associations
 *    (https://en.wikipedia.org/wiki/UEFA_coefficient, fetched
 *    2026-09-11). Used for European top flights not on the IFFHS list,
 *    converted onto the same points scale via Belgium's own real
 *    coefficient (59.050) and its real IFFHS points (957.5) as the
 *    bridge between the two indices — Belgium is this project's own
 *    calibration anchor, so it's the one country guaranteed to be real
 *    and present in both sources.
 *
 * Every `country_id` below is Impect's own real numeric id, verified
 * live against this project's synced `impect_competitions` catalog
 * (self-evident from unambiguous league names — e.g. country_id 412
 * only ever appears against "Campeonato Brasileiro Série A/B" and
 * other clearly-Brazilian names — and cross-checked for the two
 * German-speaking "Bundesliga" names specifically, since Germany's
 * "1. Bundesliga" and Austria's plain "Bundesliga" are real, distinct
 * competitions that share a near-identical name: country_id 466 pairs
 * only with "1./2./3. [German-tier] Bundesliga"/"3. Liga", 398 only with
 * plain "Bundesliga"/"2. Liga" — confirmed via
 * `impect_competitions.country_id` grouping, not guessed).
 *
 * A country/league not listed here has no real external strength data
 * this project has sourced yet — it keeps DEFAULT_COMPETITION_STRENGTH
 * (scoringConfig.mjs), same honest "provisional" fallback as before.
 * International (non-club) competitions — World Cup, Euros, Nations
 * League, continental cups, Olympics, youth internationals — all share
 * Impect's own country_id 346 and are deliberately NOT covered here:
 * club-league strength data doesn't describe a one-off international
 * tournament's real quality, and this project has no better source for
 * that yet. Same for reserve/academy competitions (Primavera, U17-U23
 * youth leagues) — comparing youth-team output to senior-league norms
 * would be a real category error, not a calibration nuance.
 */

// Belgium is this project's own calibration anchor (multiplier 1.0,
// offset 0) — every other real number below is expressed relative to it.
const ANCHOR_COUNTRY_ID = 376;
const ANCHOR_IFFHS_POINTS = 957.5; // Jupiler Pro League, real IFFHS points

/** Real UEFA coefficient for Belgium (the anchor) — the bridge constant between the two source scales. */
const ANCHOR_UEFA_COEFFICIENT = 59.05;

/**
 * `points`: real IFFHS points where the country's top flight is on the
 * IFFHS top-20 list, verbatim; `uefaCoefficient`: real UEFA coefficient
 * used to derive an equivalent points estimate for the many additional
 * European countries the IFFHS top-20 doesn't cover. Exactly one of the
 * two is set per entry — never both, so it's always clear which real
 * source a given country's number came from.
 */
const COUNTRY_STRENGTH_SOURCE = {
  // IFFHS top-20 (real points, financefootball.com / IFFHS, 2026-09-11)
  549: { points: 2359 }, // England
  491: { points: 2073 }, // Spain
  412: { points: 1999 }, // Brazil
  535: { points: 1972 }, // Italy
  466: { points: 1880 }, // Germany
  494: { points: 1502 }, // France
  430: { points: 1145 }, // Portugal
  405: { points: 1089 }, // Argentina
  384: { points: 1064 }, // Netherlands
  553: { points: 1025.5 }, // Colombia
  524: { points: 980 }, // Turkey
  [ANCHOR_COUNTRY_ID]: { points: ANCHOR_IFFHS_POINTS }, // Belgium — anchor
  460: { points: 868.75 }, // Saudi Arabia
  470: { points: 817.5 }, // Ecuador
  500: { points: 748.25 }, // Greece
  522: { points: 716 }, // Czech Republic
  537: { points: 700.75 }, // Japan

  // UEFA coefficients (real, en.wikipedia.org/wiki/UEFA_coefficient, 2026-09-11) —
  // European top flights not on the IFFHS top-20 list.
  398: { uefaCoefficient: 27.65 }, // Austria
  427: { uefaCoefficient: 45.125 }, // Poland
  393: { uefaCoefficient: 38.612 }, // Norway
  445: { uefaCoefficient: 38.306 }, // Denmark
  464: { uefaCoefficient: 30.2 }, // Switzerland
  528: { uefaCoefficient: 27.312 }, // Hungary
  559: { uefaCoefficient: 26.25 }, // Scotland
  462: { uefaCoefficient: 25.75 }, // Sweden
  443: { uefaCoefficient: 25.656 }, // Croatia
  448: { uefaCoefficient: 24.875 }, // Romania
  534: { uefaCoefficient: 23.875 }, // Israel
  488: { uefaCoefficient: 22.843 }, // Slovenia
  485: { uefaCoefficient: 22.375 }, // Slovakia
  414: { uefaCoefficient: 20.562 }, // Bulgaria
  576: { uefaCoefficient: 18.25 }, // Serbia
  533: { uefaCoefficient: 17.02 }, // Iceland
  532: { uefaCoefficient: 16.343 }, // Republic of Ireland
  565: { uefaCoefficient: 13.875 }, // Latvia
  475: { uefaCoefficient: 13.625 }, // Finland
  571: { uefaCoefficient: 8.125 }, // Lithuania
  497: { uefaCoefficient: 6.5 }, // Georgia
  561: { uefaCoefficient: 6.625 }, // Northern Ireland
};

/** Real equivalent-points estimate for a country only covered by the UEFA-coefficient source, bridged through Belgium's own real numbers in both scales. */
function estimatePointsFromUefaCoefficient(coefficient) {
  return ANCHOR_IFFHS_POINTS * (coefficient / ANCHOR_UEFA_COEFFICIENT);
}

function pointsForCountry(countryId) {
  const source = COUNTRY_STRENGTH_SOURCE[countryId];
  if (!source) return null;
  return source.points ?? estimatePointsFromUefaCoefficient(source.uefaCoefficient);
}

/**
 * Real Impect competition names (verified live against this project's
 * own synced `impect_competitions.competition_name` values, not
 * guessed), mapped to their real country and real division tier within
 * that country's pyramid. `tier: 1` is the top flight; each tier below
 * it compounds TIER_DISCOUNT once further (see below) — the same real
 * ratio this project already used for Belgium's own Challenger Pro
 * League relative to the Jupiler Pro League, generalized to every other
 * country's real division structure instead of being Belgium-specific.
 */
const COMPETITION_TIER = {
  // Belgium (anchor)
  "Jupiler Pro League": { countryId: 376, tier: 1 },
  "Challenger Pro League": { countryId: 376, tier: 2 },

  // England
  "Premier League": { countryId: 549, tier: 1 },
  Championship: { countryId: 549, tier: 2 },
  "League One": { countryId: 549, tier: 3 },
  "League Two": { countryId: 549, tier: 4 },
  "National League": { countryId: 549, tier: 5 },
  "National League North": { countryId: 549, tier: 6 },
  "National League South": { countryId: 549, tier: 6 },

  // Spain
  LaLiga: { countryId: 491, tier: 1 },
  LaLiga2: { countryId: 491, tier: 2 },
  "Primera Federación - Grupo I": { countryId: 491, tier: 3 },
  "Primera Federación - Grupo II": { countryId: 491, tier: 3 },

  // Italy
  "Serie A": { countryId: 535, tier: 1 },
  "Serie B": { countryId: 535, tier: 2 },
  "Serie C - Girone A": { countryId: 535, tier: 3 },
  "Serie C - Girone B": { countryId: 535, tier: 3 },
  "Serie C - Girone C": { countryId: 535, tier: 3 },

  // Germany (466) vs. Austria (398) — real, distinct competitions, see file header
  "1. Bundesliga": { countryId: 466, tier: 1 },
  "2. Bundesliga": { countryId: 466, tier: 2 },
  "3. Liga": { countryId: 466, tier: 3 },
  "Regionalliga Bayern": { countryId: 466, tier: 4 },
  "Regionalliga Nord": { countryId: 466, tier: 4 },
  "Regionalliga Nordost": { countryId: 466, tier: 4 },
  "Regionalliga Südwest": { countryId: 466, tier: 4 },
  "Regionalliga West": { countryId: 466, tier: 4 },
  Bundesliga: { countryId: 398, tier: 1 },
  "2. Liga": { countryId: 398, tier: 2 },

  // France
  "Ligue 1": { countryId: 494, tier: 1 },
  "Ligue 2": { countryId: 494, tier: 2 },
  "Ligue 3": { countryId: 494, tier: 3 },

  // Netherlands
  Eredivisie: { countryId: 384, tier: 1 },
  "Keuken Kampioen Divisie": { countryId: 384, tier: 2 },

  // Portugal
  "Liga Portugal Bwin": { countryId: 430, tier: 1 },
  "Liga Portugal 2": { countryId: 430, tier: 2 },
  "Liga Portugal 3": { countryId: 430, tier: 3 },

  // Turkey
  "Süper Lig": { countryId: 524, tier: 1 },
  "1.Lig": { countryId: 524, tier: 2 },

  // Brazil
  "Campeonato Brasileiro Série A": { countryId: 412, tier: 1 },
  "Campeonato Brasileiro Série B": { countryId: 412, tier: 2 },

  // Argentina
  "Liga Profesional de Fútbol": { countryId: 405, tier: 1 },
  "Primera Nacional": { countryId: 405, tier: 2 },

  // Colombia
  "Liga Dimayor I": { countryId: 553, tier: 1 },
  "Torneo DIMAYOR I": { countryId: 553, tier: 1 },

  // Ecuador
  "LigaPro Serie A": { countryId: 470, tier: 1 },
  "LigaPro Serie A Primera Etapa": { countryId: 470, tier: 1 },

  // Saudi Arabia
  "Saudi Pro League": { countryId: 460, tier: 1 },
  "Saudi First Division League": { countryId: 460, tier: 2 },

  // Greece
  "Super League 1": { countryId: 500, tier: 1 },

  // Czech Republic
  "Fortuna Liga": { countryId: 522, tier: 1 },
  "Chance Narodni Liga": { countryId: 522, tier: 2 },

  // Japan
  "J1 League": { countryId: 537, tier: 1 },
  "J2 League": { countryId: 537, tier: 2 },
  "J3 League": { countryId: 537, tier: 3 },

  // Austria's 2nd tier already covered above; remaining UEFA-coefficient-only countries:
  "PKO BP Ekstraklasa": { countryId: 427, tier: 1 }, // Poland
  "Betclic 1 Liga ": { countryId: 427, tier: 2 }, // Poland — real trailing space in Impect's own name
  Eliteserien: { countryId: 393, tier: 1 }, // Norway
  "OBOS-ligaen": { countryId: 393, tier: 2 }, // Norway
  Superligaen: { countryId: 445, tier: 1 }, // Denmark
  "1. Division": { countryId: 445, tier: 2 }, // Denmark
  "Super League": { countryId: 464, tier: 1 }, // Switzerland
  "Challenge League": { countryId: 464, tier: 2 }, // Switzerland
  "Promotion League": { countryId: 464, tier: 3 }, // Switzerland
  "Nemzeti Bajnokság": { countryId: 528, tier: 1 }, // Hungary
  "Scottish Premiership": { countryId: 559, tier: 1 }, // Scotland
  "Scottish Championship": { countryId: 559, tier: 2 }, // Scotland
  Allsvenskan: { countryId: 462, tier: 1 }, // Sweden
  Superettan: { countryId: 462, tier: 2 }, // Sweden
  "1.HNL": { countryId: 443, tier: 1 }, // Croatia
  SuperLiga: { countryId: 448, tier: 1 }, // Romania
  "Ligat ha'Al": { countryId: 534, tier: 1 }, // Israel
  "Prva Liga": { countryId: 488, tier: 1 }, // Slovenia
  "Niké Liga": { countryId: 485, tier: 1 }, // Slovakia
  "efbet Liga": { countryId: 414, tier: 1 }, // Bulgaria
  "Super liga Srbije": { countryId: 576, tier: 1 }, // Serbia
  "Besta deild": { countryId: 533, tier: 1 }, // Iceland
  Lengjudeild: { countryId: 533, tier: 2 }, // Iceland
  "Irish Premier Division": { countryId: 532, tier: 1 }, // Republic of Ireland
  Virsliga: { countryId: 565, tier: 1 }, // Latvia
  Veikkausliiga: { countryId: 475, tier: 1 }, // Finland
  "A Lyga": { countryId: 571, tier: 1 }, // Lithuania
  "Erovnuli Liga": { countryId: 497, tier: 1 }, // Georgia
  "NIFL Premiership": { countryId: 561, tier: 1 }, // Northern Ireland
};

/**
 * Formula (documented, bounded, applied uniformly regardless of which
 * real source a country's points came from):
 *   ratio = countryPoints / anchorPoints
 *   logRatio = ln(ratio)               — dampens extreme ratios (a 2.5x
 *                                         points gap shouldn't translate
 *                                         into a 2.5x calibration swing)
 *   offset = clamp(OFFSET_SCALE * logRatio, OFFSET_BOUNDS)
 *   multiplier = clamp(1 + MULTIPLIER_SCALE * logRatio, MULTIPLIER_BOUNDS)
 * Constants are a real, disclosed modelling choice (not derived from the
 * source data itself, since no published index translates directly into
 * this project's 0-100 percentile-calibration formula) — bounded
 * conservatively so a real source-data error or an extreme outlier
 * competition can't blow the calibrated score off the 0-100 scale
 * before the final clamp in competitionStrength.mjs even applies.
 */
const OFFSET_SCALE = 12;
const OFFSET_BOUNDS = [-15, 25];
const MULTIPLIER_SCALE = 0.15;
const MULTIPLIER_BOUNDS = [0.7, 1.35];

/** Real per-tier-below-top-flight discount — exactly the ratio this project already used for Belgium's own Challenger Pro League (0.85 / -3) relative to the Jupiler Pro League, generalized to every other country's real division structure. */
const TIER_DISCOUNT = { multiplierFactor: 0.85, offsetDelta: -3 };

function clamp(value, [min, max]) {
  return Math.min(max, Math.max(min, value));
}

function deriveFromPoints(points) {
  const logRatio = Math.log(points / ANCHOR_IFFHS_POINTS);
  return {
    offset: clamp(OFFSET_SCALE * logRatio, OFFSET_BOUNDS),
    multiplier: clamp(1 + MULTIPLIER_SCALE * logRatio, MULTIPLIER_BOUNDS),
  };
}

function applyTierDiscount(base, tier) {
  let { multiplier, offset } = base;
  for (let level = 1; level < tier; level++) {
    multiplier *= TIER_DISCOUNT.multiplierFactor;
    offset += TIER_DISCOUNT.offsetDelta;
  }
  return { multiplier: clamp(multiplier, MULTIPLIER_BOUNDS), offset: clamp(offset, OFFSET_BOUNDS) };
}

/**
 * Precomputed once at module load — every real competition name above
 * gets a real {multiplier, offset, tier} entry, derived from real
 * external data through the documented formula, never hand-picked per
 * competition. `tier` here is a human-readable provenance label (not
 * the division-tier number), kept for the existing
 * `Boolean(COMPETITION_STRENGTH[name])` "is this competition's strength
 * a configured real value or the unranked default" check elsewhere in
 * this codebase.
 */
export const DERIVED_COMPETITION_STRENGTH = Object.fromEntries(
  Object.entries(COMPETITION_TIER)
    .map(([name, { countryId, tier }]) => {
      const points = pointsForCountry(countryId);
      if (points === null) return null; // country not in either real source — falls back to the default elsewhere
      const base = deriveFromPoints(points);
      const { multiplier, offset } = tier === 1 ? base : applyTierDiscount(base, tier);
      const source = COUNTRY_STRENGTH_SOURCE[countryId].points !== undefined ? "iffhs" : "uefa-coefficient-derived";
      return [name, { multiplier: Math.round(multiplier * 1000) / 1000, offset: Math.round(offset * 100) / 100, tier: tier === 1 ? source : `${source}-tier${tier}` }];
    })
    .filter(Boolean)
);
