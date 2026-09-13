import { KV_MECHELEN_PROFILE, KV_MECHELEN_PROFILE_VERSION, priorityWeight } from "./config/kvMechelenProfile.mjs";

const ROLE_FIT_MIX = {
  "Immediate Starter": { immediate: 0.75, development: 0.25 },
  Rotation: { immediate: 0.55, development: 0.45 },
  Development: { immediate: 0.25, development: 0.75 },
};

/**
 * A shortfall against a real, disclosed minimum requirement caps the
 * fit score rather than letting strong performance elsewhere average it
 * away — per the brief's explicit "voorkom dat sterke prestaties op
 * minder belangrijke onderdelen een essentiële zwakte volledig
 * compenseren." The penalty scales with how far below the floor the
 * player actually is (a small, marginal miss costs less than a severe
 * one), floored at 0.4 so a single weak floor never zeroes out an
 * otherwise-strong profile outright — a real, disclosed modelling
 * choice, not derived from validated recruitment outcomes (see
 * docs/SCORING_MODEL.md's KV Fit validation section for what would be
 * needed to tune this against real data).
 */
function minimumRequirementPenalty(pillarsByKey, minimumRequirements) {
  let worstPenalty = 1;
  const failedRequirements = [];
  for (const { pillarKey, minPercentile } of minimumRequirements) {
    const pillar = pillarsByKey.get(pillarKey);
    if (!pillar || !pillar.available || pillar.percentile === null) continue; // can't check a requirement with no real data — never penalize for missing data here, dataCompleteness already covers that
    if (pillar.percentile >= minPercentile) continue;
    const shortfall = (minPercentile - pillar.percentile) / minPercentile;
    const penalty = Math.max(0.4, 1 - 0.5 * shortfall);
    if (penalty < worstPenalty) worstPenalty = penalty;
    failedRequirements.push({ pillarKey, label: pillar.label, minPercentile, actualPercentile: pillar.percentile });
  }
  return { penalty: worstPenalty, failedRequirements };
}

function weightedQualityScore(pillarsByKey, desiredQualities) {
  let weightedSum = 0;
  let weightTotal = 0;
  const breakdown = [];
  for (const { pillarKey, priority } of desiredQualities) {
    const pillar = pillarsByKey.get(pillarKey);
    if (!pillar || !pillar.available || pillar.score === null) continue; // no real data for this quality — excluded, not scored as 0
    const weight = priorityWeight(priority);
    weightedSum += pillar.score * weight;
    weightTotal += weight;
    breakdown.push({ pillarKey, label: pillar.label, priority, score: pillar.score, percentile: pillar.percentile });
  }
  return { score: weightTotal > 0 ? weightedSum / weightTotal : null, breakdown };
}

/**
 * KVMechelenFitScorer — reuses the already-computed Current Level
 * pillar breakdown and Potential result (never recomputes raw Impect
 * data itself) to score how well a player's real, measured profile
 * matches KV Mechelen's configurable role profile
 * (config/kvMechelenProfile.mjs). Deliberately separate from Current
 * Level/Potential: a genuinely excellent player can still be a poor
 * positional/style match, and vice versa.
 */
export function scoreKvMechelenFit({ positionGroup, currentLevel, potential, pillars, dataCompleteness }) {
  const profile = KV_MECHELEN_PROFILE[positionGroup];
  if (!profile) {
    return { supported: false, reason: `No KV Mechelen role profile configured for "${positionGroup}" yet.`, immediateFit: null, developmentFit: null, totalFit: null };
  }

  const pillarsByKey = new Map(pillars.map((p) => [p.key, p]));
  const { score: qualityScore, breakdown: qualityBreakdown } = weightedQualityScore(pillarsByKey, profile.desiredQualities);
  const { penalty, failedRequirements } = minimumRequirementPenalty(pillarsByKey, profile.minimumRequirements);

  if (qualityScore === null) {
    return {
      supported: true,
      reason: "None of this role's desired qualities have real data available for this player yet.",
      immediateFit: null,
      developmentFit: null,
      totalFit: null,
      profileVersion: KV_MECHELEN_PROFILE_VERSION,
    };
  }

  // Immediate Fit: real quality match (already Pro-League-calibrated,
  // same scale as Current Level) against the role's desired current
  // level, gated by any failed minimum requirement.
  const levelGapPenalty = currentLevel < profile.desiredCurrentLevel ? Math.max(0.7, 1 - (profile.desiredCurrentLevel - currentLevel) / 200) : 1;
  const immediateFitRaw = qualityScore * penalty * levelGapPenalty;
  const immediateFit = Math.round(Math.min(100, Math.max(0, immediateFitRaw)) * 10) / 10;

  // Development Fit: real upside (Potential - Current Level) scaled by
  // how well that upside fits the role's desired development window —
  // a large gap is only a good Development Fit if the role's window is
  // long enough to realize it; a role wanting an immediate impact gets
  // little credit for pure long-term upside here (that's what
  // ROLE_FIT_MIX's weighting toward "immediate" already handles at the
  // Total Fit level).
  const upside = Math.max(0, potential - currentLevel);
  const windowFactor = Math.min(1, profile.desiredDevelopmentWindowSeasons / 3); // a 3+-season window gets full credit for realistic upside
  const developmentFitRaw = qualityScore * 0.6 + upside * 4 * windowFactor; // upside is typically 0-20 points; scaled up so real trajectory potential meaningfully moves this score
  const developmentFit = Math.round(Math.min(100, Math.max(0, developmentFitRaw)) * 10) / 10;

  const mix = ROLE_FIT_MIX[profile.intendedRole] ?? ROLE_FIT_MIX.Rotation;
  const totalFit = Math.round((immediateFit * mix.immediate + developmentFit * mix.development) * 10) / 10;

  return {
    supported: true,
    reason: null,
    immediateFit,
    developmentFit,
    totalFit,
    intendedRole: profile.intendedRole,
    playingStyle: profile.playingStyle,
    desiredCurrentLevel: profile.desiredCurrentLevel,
    desiredDevelopmentWindowSeasons: profile.desiredDevelopmentWindowSeasons,
    qualityBreakdown,
    failedRequirements,
    dataCompleteness,
    profileVersion: KV_MECHELEN_PROFILE_VERSION,
  };
}
