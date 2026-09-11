/**
 * Every tunable constant for the scoring model in one place — Step 4/5's
 * explicit requirement ("Use configuration files for metric weights...
 * Do not bury weights inside calculation functions", "Keep the
 * reliability constant configurable rather than scattering hard-coded
 * values throughout the code"). Change the model by editing this file,
 * not by hunting through the scoring modules.
 */

import { DERIVED_COMPETITION_STRENGTH } from "./competitionStrengthData.mjs";

export const MODEL_VERSION = "1.2.0";

/** Minimum minutes a player needs before their rating is calculated at all — below this, the sample is too thin to say anything. */
export const MIN_MINUTES_FOR_RATING = 270; // ~3 full matches, same bar already used for the pizza-chart percentile population (src/components/dashboard/ImpectPlayerPizzaDrawer.tsx)

/** Minimum comparable-peer count for a cohort to be used directly, before falling back to a broader one. */
export const MIN_COHORT_SIZE = 15;

/**
 * Bayesian shrinkage toward the cohort average (50th percentile),
 * exactly the formula from the spec:
 *   reliability = minutes / (minutes + RELIABILITY_CONSTANT)
 *   adjusted = 50 + reliability * (raw_percentile - 50)
 * A higher constant demands more minutes before trusting the raw
 * percentile fully. 450 minutes (~5 matches) gives ~63% reliability;
 * 1800 minutes (~20 matches) gives ~87%.
 */
export const RELIABILITY_CONSTANT = 270;

/** Winsorization bounds — values outside this percentile range are clipped before percentile-ranking, so one extreme outlier match/season can't dominate a cohort. */
export const WINSORIZE_LOW_PERCENTILE = 2;
export const WINSORIZE_HIGH_PERCENTILE = 98;

/**
 * Current Level calibration bands (Step 4) — these are absolute level
 * labels tied to the *calibrated* score, never the raw cohort
 * percentile (a 90th-percentile player in a weak competition does not
 * automatically get a 90 Current Level — see competitionStrength.mjs's
 * calibration step).
 */
export const CURRENT_LEVEL_BANDS = [
  { min: 90, label: "Elite / Champions League star level" },
  { min: 85, label: "Champions League level" },
  { min: 80, label: "Strong top-five-league level" },
  { min: 75, label: "Strong European first-division level" },
  { min: 70, label: "Good Belgian Pro League level" },
  { min: 65, label: "Belgian Pro League squad level" },
  { min: 60, label: "Strong second division or development level" },
  { min: 0, label: "Lower current level or insufficient development" },
];

/**
 * Competition-strength calibration. `1.0`/`0` = Belgium's own Jupiler
 * Pro League, this project's calibration anchor (per the
 * CURRENT_LEVEL_BANDS' own "Good Belgian Pro League level" wording).
 * Applied as:
 *   calibrated = 50 + (rawCurrentLevel - 50) * multiplier + offset
 * A multiplier below 1 compresses scores earned in a weaker competition
 * toward the middle; `offset` shifts the anchor itself down for a
 * genuinely weaker league. Keyed by real competitionName strings from
 * `impect_competitions`.
 *
 * ~90 of Impect's real competition names — every major domestic league
 * this project has real external strength data for — are derived from
 * two real, cited, independently published sources (IFFHS's strongest-
 * leagues ranking and UEFA's country coefficients) via
 * competitionStrengthData.mjs, not hand-picked: see that file's header
 * for the full methodology and sources. A competition not covered there
 * (no real external strength data sourced for it yet — most non-
 * European/non-IFFHS-top-20 leagues, all international tournaments,
 * all youth/reserve competitions) falls back to
 * DEFAULT_COMPETITION_STRENGTH, an honest "unranked" placeholder, same
 * as before.
 */
export const COMPETITION_STRENGTH = DERIVED_COMPETITION_STRENGTH;

export const DEFAULT_COMPETITION_STRENGTH = { multiplier: 0.85, offset: -3, tier: "provisional-default" };

/**
 * Potential development curves (Step 5) — PROVISIONAL, position-group
 * specific. `peakAge` is when a typical player of this position group
 * is assumed to reach their ceiling; `maxUpside` is the largest
 * plausible Current-Level-to-Potential gap for a very young player of
 * this position, decaying to 0 by `peakAge`. Goalkeepers and centre
 * backs get a later curve than wingers/strikers, per the spec's own
 * example — Goalkeeper isn't scored yet (see positionPillars.mjs) but
 * keeps a curve defined here for when it is.
 */
export const DEVELOPMENT_CURVES = {
  Goalkeeper: { peakAge: 29, maxUpside: 18 },
  "Centre Back": { peakAge: 27, maxUpside: 16 },
  Fullback: { peakAge: 26, maxUpside: 17 },
  "Defensive Midfield": { peakAge: 26, maxUpside: 16 },
  "Central Midfield": { peakAge: 26, maxUpside: 17 },
  "Attacking Midfield": { peakAge: 25, maxUpside: 18 },
  Winger: { peakAge: 25, maxUpside: 19 },
  Striker: { peakAge: 26, maxUpside: 18 },
};

/** Below this age, potential upside is at its curve maximum; above `DEVELOPMENT_CURVES[group].peakAge`, upside is 0. */
export const DEVELOPMENT_CURVE_START_AGE = 18;

/** Percentile thresholds for calling a pillar a strength/weakness in the generated explanation (Step 7). */
export const STRENGTH_PERCENTILE_THRESHOLD = 75;
export const WEAKNESS_PERCENTILE_THRESHOLD = 35;

/** A pillar below this reliability (see RELIABILITY_CONSTANT) is never called a strength or weakness — too little signal to say so with confidence. */
export const MIN_RELIABILITY_FOR_STRENGTH_WEAKNESS = 0.55;

/** Confidence label bands (Step 6). */
export const CONFIDENCE_BANDS = [
  { min: 70, label: "High" },
  { min: 40, label: "Medium" },
  { min: 0, label: "Low" },
];
