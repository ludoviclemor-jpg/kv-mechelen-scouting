/**
 * Every tunable constant for the scoring model in one place — Step 4/5's
 * explicit requirement ("Use configuration files for metric weights...
 * Do not bury weights inside calculation functions", "Keep the
 * reliability constant configurable rather than scattering hard-coded
 * values throughout the code"). Change the model by editing this file,
 * not by hunting through the scoring modules.
 */

import { DERIVED_COMPETITION_STRENGTH } from "./competitionStrengthData.mjs";

export const MODEL_VERSION = "2.0.0";

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

/**
 * Same shrinkage formula, but for rate metrics (duel win %), using real
 * attempt counts instead of minutes (found 2026-09-13: using minutes
 * uniformly for a win % let a low-engagement player's rarely-contested
 * duels look just as reliable as a duel-heavy defender's, purely
 * because they played similar minutes). 20 real attempts is a real
 * modelling choice, not derived from a fitted curve on this project's
 * own data (no historical duel-outcome dataset exists yet to fit one) —
 * it's the commonly-cited rough order of magnitude at which a binary
 * success-rate stat starts to stabilize in sports-analytics literature,
 * used here as a disclosed, provisional prior, not a proven constant.
 */
export const RATE_RELIABILITY_CONSTANT = 20;

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
/**
 * These used to carry real-world league labels ("Champions League
 * level", "Strong top-five-league level") — removed 2026-09-13. This
 * project has never validated the score-to-real-level mapping against
 * actual reference players (no held-out set of "known Champions-League-
 * quality players" was checked against the calibrated score), so a
 * label implying that mapping is a claim this project can't back up.
 * These are model-index bands only — a neutral ordinal read of where a
 * score sits on the 0-100 scale, not a verified real-world equivalence.
 * If/when real reference-player validation exists (see the "Validation"
 * section of docs/SCORING_MODEL.md), real-world labels can be
 * reintroduced with that evidence cited.
 */
export const CURRENT_LEVEL_BANDS = [
  { min: 90, label: "Model index: top band (90-100, provisional)" },
  { min: 80, label: "Model index: very high (80-89, provisional)" },
  { min: 70, label: "Model index: high (70-79, provisional)" },
  { min: 60, label: "Model index: above average (60-69, provisional)" },
  { min: 50, label: "Model index: average (50-59, provisional)" },
  { min: 40, label: "Model index: below average (40-49, provisional)" },
  { min: 0, label: "Model index: low (0-39, provisional)" },
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
