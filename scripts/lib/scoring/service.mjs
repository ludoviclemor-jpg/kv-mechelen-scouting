import { positionGroup } from "./positionGroup.mjs";
import { POSITION_PILLARS } from "./config/positionPillars.mjs";
import { MODEL_VERSION, MIN_MINUTES_FOR_RATING } from "./config/scoringConfig.mjs";
import { buildCohort } from "./cohorts.mjs";
import { scoreCurrentLevel } from "./currentLevel.mjs";
import { scorePotential } from "./potential.mjs";
import { scoreConfidence } from "./confidence.mjs";
import { buildStrengthsAndWeaknesses, buildDevelopmentPriorities, buildExplanation } from "./explanations.mjs";
import { COMPETITION_STRENGTH } from "./config/scoringConfig.mjs";
import { getTransferEvidence } from "./transferEvidence.mjs";
import { scoreKvMechelenFit } from "./kvMechelenFit.mjs";

function ageFromBirthdate(birthdate, asOf = new Date()) {
  if (!birthdate) return null;
  const dob = new Date(birthdate);
  let age = asOf.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear = asOf.getMonth() > dob.getMonth() || (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age;
}

/**
 * scoring_service.score_player equivalent (Step 8) — the single entry
 * point everything else (CLI, tests) calls. Pure function: same inputs
 * + same MODEL_VERSION always produce the same output (Step 11's
 * determinism requirement) — no randomness, no wall-clock dependency in
 * the math itself (only `calculatedAt` in the returned envelope records
 * real time, the scores never do).
 *
 * @param {object} params
 * @param {object} params.player - one impect_player_kpis-shaped row for this player+competition, plus identity (name, birthdate) and competition context already joined on.
 * @param {object[]} params.pool - every other player row in the same broad position group (any competition currently synced) — used to build the cohort; role-level narrowing isn't available yet (see cohorts.mjs).
 * @param {Map<number,string>} params.competitionTierByIterationId - iterationId -> a coarse tier label, used only for the cohort fallback hierarchy's "same tier" level.
 * @param {boolean} [params.hasMultiSeasonData] - real flag from the caller; false for every player today (see potential.mjs's header).
 */
export function scorePlayer({ player, pool, competitionTierByIterationId, hasMultiSeasonData = false }) {
  const group = positionGroup(player.position);
  const positionGroupConfig = POSITION_PILLARS[group];

  if (!positionGroupConfig) {
    return unratableResult(player, group, `Unknown position group "${group}" — no pillar configuration exists for it.`);
  }
  if (!positionGroupConfig.supported) {
    return unratableResult(player, group, positionGroupConfig.unsupportedReason);
  }
  if (!player.minutes || player.minutes < MIN_MINUTES_FOR_RATING) {
    return unratableResult(player, group, `Fewer than ${MIN_MINUTES_FOR_RATING} minutes played (${player.minutes ?? 0}) — too thin a sample to rate.`);
  }

  const { cohort, level: cohortLevel, fallbackUsed } = buildCohort({ player, pool, competitionTierByIterationId });

  const currentLevelResult = scoreCurrentLevel({
    player,
    positionGroupConfig,
    cohort,
    competitionName: player.competitionName,
  });

  const avgPillarReliability =
    currentLevelResult.pillars.filter((p) => p.available).length > 0
      ? currentLevelResult.pillars.filter((p) => p.available).reduce((s, p) => s + p.reliability, 0) / currentLevelResult.pillars.filter((p) => p.available).length
      : 0;

  const age = ageFromBirthdate(player.birthdate);
  const potentialResult = scorePotential({
    currentLevel: currentLevelResult.currentLevel,
    age,
    positionGroup: group,
    avgReliability: avgPillarReliability,
    dataCompleteness: currentLevelResult.dataCompleteness,
    hasMultiSeasonData,
  });

  const competitionKnown = Boolean(COMPETITION_STRENGTH[player.competitionName]);
  const confidenceResult = scoreConfidence({
    reliability: avgPillarReliability,
    dataCompleteness: currentLevelResult.dataCompleteness,
    cohortSize: cohort.length,
    competitionKnown,
    hasPosition: Boolean(player.position),
    fallbackUsed,
  });

  const { strengths, weaknesses } = buildStrengthsAndWeaknesses(currentLevelResult.pillars);
  const developmentPriorities = buildDevelopmentPriorities(weaknesses);
  const explanation = buildExplanation({
    playerName: player.name,
    positionGroup: group,
    competitionName: player.competitionName,
    minutes: player.minutes,
    strengths,
    weaknesses,
    currentLevel: currentLevelResult.currentLevel,
    potential: potentialResult.potential,
    ageUpsideApplied: potentialResult.ageUpsideApplied,
    cohortLevel,
  });

  // Real, disclosed cross-check only — never used to adjust the score
  // itself (see transferEvidence.mjs's header for why: the real fit
  // against today's transfer sample sizes was worse than predicting the
  // mean, so blending it in would be overfitting noise, not an
  // improvement).
  const transferEvidence = getTransferEvidence(player.competitionName);

  // Separate from Current Level / Potential entirely — a genuinely good
  // player is not automatically a good match for KV Mechelen (see
  // kvMechelenFit.mjs and config/kvMechelenProfile.mjs's own headers).
  const kvMechelenFit = scoreKvMechelenFit({
    positionGroup: group,
    currentLevel: currentLevelResult.currentLevel,
    potential: potentialResult.potential,
    pillars: currentLevelResult.pillars,
    dataCompleteness: currentLevelResult.dataCompleteness,
  });

  const warnings = [];
  if (fallbackUsed) warnings.push(`Cohort fallback used: ${cohortLevel} (fewer than the configured minimum comparable peers in the narrower cohort).`);
  if (!competitionKnown) warnings.push(`Competition strength for "${player.competitionName}" uses the provisional default, not a specifically configured value.`);
  if (currentLevelResult.dataCompleteness < 70) warnings.push(`Only ${currentLevelResult.dataCompleteness}% of this position's used metrics are available for this player.`);
  if (!hasMultiSeasonData) warnings.push("Potential is based on a single season of data — trajectory-based projection isn't available yet.");

  return {
    playerId: String(player.playerId),
    scoutasticPlayerId: player.transfermarktId ?? null,
    modelVersion: MODEL_VERSION,
    calculatedAt: new Date().toISOString(),
    ratable: true,
    currentLevel: currentLevelResult.currentLevel,
    currentLevelBand: currentLevelResult.band,
    potential: potentialResult.potential,
    potentialRange: potentialResult.range,
    overallPercentile: currentLevelResult.overallPercentile,
    confidence: confidenceResult,
    kvMechelenFit,
    context: {
      position: player.position,
      positionGroup: group,
      role: group, // no sub-position role classification exists yet — see cohorts.mjs's header
      season: player.season,
      competition: player.competitionName,
      minutes: player.minutes,
      cohortSize: cohort.length,
      cohortLevel,
      age,
      competitionCalibration: {
        rawScore: currentLevelResult.rawScore,
        calibratedScore: currentLevelResult.currentLevel,
        competitionAdjustment: currentLevelResult.competitionAdjustment,
        // Real diagnostic only (see transferEvidence.mjs) — not used to compute calibratedScore.
        realTransferEvidence: transferEvidence,
      },
    },
    pillars: currentLevelResult.pillars,
    strengths,
    weaknesses,
    developmentPriorities,
    explanation,
    warnings,
  };
}

function unratableResult(player, group, reason) {
  return {
    playerId: String(player.playerId),
    scoutasticPlayerId: player.transfermarktId ?? null,
    modelVersion: MODEL_VERSION,
    calculatedAt: new Date().toISOString(),
    ratable: false,
    reason,
    currentLevel: null,
    currentLevelBand: null,
    potential: null,
    potentialRange: null,
    overallPercentile: null,
    confidence: { score: 0, label: "Low", reasons: [reason] },
    kvMechelenFit: { supported: false, reason: "Not ratable — see `reason` above.", immediateFit: null, developmentFit: null, totalFit: null },
    context: { position: player.position, positionGroup: group, role: null, season: player.season, competition: player.competitionName, minutes: player.minutes ?? 0, cohortSize: 0, cohortLevel: null, age: ageFromBirthdate(player.birthdate) },
    pillars: [],
    strengths: [],
    weaknesses: [],
    developmentPriorities: [],
    explanation: null,
    warnings: [reason],
  };
}
