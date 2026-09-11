import { COMPETITION_STRENGTH, DEFAULT_COMPETITION_STRENGTH } from "./config/scoringConfig.mjs";

/** Real competitionName string (from impect_competitions) -> its configured (provisional) strength entry, or the documented default if unlisted. */
export function getCompetitionStrength(competitionName) {
  return COMPETITION_STRENGTH[competitionName] ?? DEFAULT_COMPETITION_STRENGTH;
}

/**
 * Calibrates a raw (cohort-relative, already shrinkage-adjusted) 0-100
 * score against the *absolute* CURRENT_LEVEL_BANDS scale (Step 4) — a
 * 90th-percentile player in a weak competition must not automatically
 * read as a 90 Current Level. `offset` shifts the whole scale for a
 * weaker league; `multiplier` compresses how far above/below the 50-
 * point cohort-average anchor a player can calibrate to.
 */
export function calibrateToCompetition(rawScore, competitionName) {
  const strength = getCompetitionStrength(competitionName);
  const calibrated = 50 + (rawScore - 50) * strength.multiplier + strength.offset;
  return { calibrated: Math.min(100, Math.max(0, calibrated)), strength };
}
