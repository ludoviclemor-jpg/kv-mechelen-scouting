import { STRENGTH_PERCENTILE_THRESHOLD, WEAKNESS_PERCENTILE_THRESHOLD, MIN_RELIABILITY_FOR_STRENGTH_WEAKNESS } from "./config/scoringConfig.mjs";

/**
 * Deterministic, template-based strengths/weaknesses/development
 * priorities/explanation (Step 7) — no generative AI, no paid API.
 * Every sentence is built from real values already computed by
 * currentLevel.mjs/potential.mjs/confidence.mjs; nothing here invents a
 * new judgment the numbers don't support.
 */
export function buildStrengthsAndWeaknesses(pillars) {
  const reliable = pillars.filter((p) => p.available && p.reliability >= MIN_RELIABILITY_FOR_STRENGTH_WEAKNESS);

  const strengths = reliable
    .filter((p) => p.percentile >= STRENGTH_PERCENTILE_THRESHOLD)
    .sort((a, b) => b.percentile - a.percentile)
    .map((p) => ({ pillar: p.key, label: p.label, percentile: p.percentile }));

  const weaknesses = reliable
    .filter((p) => p.percentile <= WEAKNESS_PERCENTILE_THRESHOLD)
    .sort((a, b) => a.percentile - b.percentile)
    .map((p) => ({ pillar: p.key, label: p.label, percentile: p.percentile }));

  return { strengths, weaknesses };
}

/** Development priorities — weak-but-trainable pillars, i.e. weaknesses that aren't purely team/context-dependent. Ball Security / Pressing / duel pillars are genuinely individual actions, so all real weaknesses qualify today (no team-dependent pillar is currently active — see positionPillars.mjs's real coverage). */
export function buildDevelopmentPriorities(weaknesses) {
  return weaknesses.slice(0, 3).map((w) => `Improve ${w.label.toLowerCase()} (currently ${w.percentile}th percentile in cohort).`);
}

function joinList(labels) {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Step 7's own example output shape, built from real values via string templates. */
export function buildExplanation({ playerName, positionGroup, competitionName, minutes, strengths, weaknesses, currentLevel, potential, ageUpsideApplied, cohortLevel }) {
  const cohortDescription = `${positionGroup.toLowerCase()}s in ${competitionName}${cohortLevel !== "position+competition+season" ? " (broadened comparison group)" : ""}`;

  const sentences = [];

  if (strengths.length > 0) {
    sentences.push(`Among ${cohortDescription}, ${playerName} ranks highly for ${joinList(strengths.slice(0, 2).map((s) => s.label.toLowerCase()))}.`);
  } else {
    sentences.push(`Among ${cohortDescription}, ${playerName}'s pillar scores are close to the cohort average across the board.`);
  }

  if (weaknesses.length > 0) {
    const weaknessLabels = joinList(weaknesses.slice(0, 2).map((w) => w.label));
    sentences.push(`${weaknessLabels} ${weaknesses.length === 1 ? "is" : "are"} closer to the cohort average.`);
  }

  sentences.push(`The Current Level rating (${currentLevel}) is ${minutes >= 1500 ? "supported by a strong sample" : "based on a limited sample"} of ${minutes} minutes.`);

  if (potential > currentLevel) {
    sentences.push(
      `The Potential rating (${potential}) reflects age-based upside${ageUpsideApplied < 3 ? ", modest given the current data" : ""} on top of the observed level — a projection, not an observed result.`
    );
  } else {
    sentences.push("Potential is currently equal to Current Level — no meaningful age-based upside applies (see the rating's development-curve context).");
  }

  return sentences.join(" ");
}
