/**
 * KV Mechelen Fit — configurable club/role profile.
 *
 * DRAFT / CONCEPT PROFILE — not a verified statement of KV Mechelen's
 * current coach, tactical system, or transfer strategy. No such
 * document exists anywhere in this codebase to source from (the club
 * has no "scouting criteria" table or config file today), so per the
 * brief's own explicit instruction ("Maak anders een duidelijk
 * aangeduid conceptprofiel dat de gebruiker kan aanpassen"), this is a
 * real, working, EDITABLE starting point built from generic modern
 * 4-2-3-1 role expectations — a scout or staff member should review and
 * adjust every field below to match the club's actual intentions.
 * Nothing about it is hard-coded into the scoring logic itself
 * (kvMechelenFit.mjs reads this file's shape, not this file's specific
 * values) — replacing this file's content is the whole mechanism for
 * "configurable."
 *
 * `desiredQualities` reference real pillar keys from positionPillars.mjs
 * (the same pillars Current Level is built from) — never a separate,
 * invented quality axis. `priority` weights how much each quality
 * counts toward Immediate Fit; `minimumRequirements` are real,
 * non-compensatory floors (see kvMechelenFit.mjs — falling short of one
 * caps the fit score regardless of how strong everything else is).
 */

export const KV_MECHELEN_FORMATION_ID = "4-2-3-1";
export const KV_MECHELEN_PROFILE_VERSION = "draft-1.0.0";

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

export function priorityWeight(priority) {
  return PRIORITY_WEIGHT[priority] ?? PRIORITY_WEIGHT.medium;
}

/**
 * One entry per position group scored by the engine (Goalkeeper is
 * omitted — see positionPillars.mjs, no real GK metric is synced yet,
 * so there is nothing here for it to compare against).
 */
export const KV_MECHELEN_PROFILE = {
  "Centre Back": {
    desiredQualities: [
      { pillarKey: "aerial_ability", priority: "high" },
      { pillarKey: "defensive_duels_intervention", priority: "high" },
      { pillarKey: "passing_progression", priority: "medium" },
      { pillarKey: "build_up_contribution", priority: "medium" },
      { pillarKey: "ball_security", priority: "low" },
    ],
    minimumRequirements: [{ pillarKey: "defensive_duels_intervention", minPercentile: 35 }],
    playingStyle: "DRAFT: comfortable building from the back under pressure; willing to step into midfield to press or intercept, not just a pure last-man defender.",
    desiredCurrentLevel: 60,
    desiredDevelopmentWindowSeasons: 3,
    intendedRole: "Rotation",
  },

  Fullback: {
    desiredQualities: [
      { pillarKey: "defensive_contribution", priority: "high" },
      { pillarKey: "ball_progression", priority: "high" },
      { pillarKey: "chance_creation", priority: "medium" },
      { pillarKey: "final_third_contribution", priority: "medium" },
      { pillarKey: "pressing", priority: "medium" },
    ],
    minimumRequirements: [{ pillarKey: "defensive_contribution", minPercentile: 35 }],
    playingStyle: "DRAFT: an attacking outlet on the flank who can overlap or underlap, expected to contribute to chance creation, not purely defensive cover.",
    desiredCurrentLevel: 58,
    desiredDevelopmentWindowSeasons: 3,
    intendedRole: "Rotation",
  },

  "Defensive Midfield": {
    desiredQualities: [
      { pillarKey: "defensive_positioning_intervention", priority: "high" },
      { pillarKey: "build_up_involvement", priority: "high" },
      { pillarKey: "progressive_passing", priority: "medium" },
      { pillarKey: "pressing", priority: "medium" },
      { pillarKey: "ball_security", priority: "medium" },
    ],
    minimumRequirements: [{ pillarKey: "ball_security", minPercentile: 30 }],
    playingStyle: "DRAFT: the pivot in front of the back four — screens the defense and dictates tempo in build-up, expected to keep the ball under pressure.",
    desiredCurrentLevel: 62,
    desiredDevelopmentWindowSeasons: 2,
    intendedRole: "Immediate Starter",
  },

  "Central Midfield": {
    desiredQualities: [
      { pillarKey: "build_up_involvement", priority: "medium" },
      { pillarKey: "progression", priority: "high" },
      { pillarKey: "chance_creation", priority: "medium" },
      { pillarKey: "defensive_contribution", priority: "medium" },
      { pillarKey: "possession_value", priority: "high" },
    ],
    minimumRequirements: [{ pillarKey: "ball_security", minPercentile: 30 }],
    playingStyle: "DRAFT: the box-to-box connector between defense and attack, expected to progress possession into dangerous zones and contribute defensively.",
    desiredCurrentLevel: 60,
    desiredDevelopmentWindowSeasons: 2,
    intendedRole: "Rotation",
  },

  "Attacking Midfield": {
    desiredQualities: [
      { pillarKey: "chance_creation", priority: "high" },
      { pillarKey: "line_breaking_actions", priority: "high" },
      { pillarKey: "goal_threat", priority: "medium" },
      { pillarKey: "pressing", priority: "low" },
    ],
    minimumRequirements: [{ pillarKey: "chance_creation", minPercentile: 30 }],
    playingStyle: "DRAFT: the creative focal point in the number 10 role behind the striker — expected to unlock defenses and contribute directly to goals.",
    desiredCurrentLevel: 62,
    desiredDevelopmentWindowSeasons: 2,
    intendedRole: "Immediate Starter",
  },

  Winger: {
    desiredQualities: [
      { pillarKey: "progression", priority: "high" },
      { pillarKey: "chance_creation", priority: "high" },
      { pillarKey: "goal_threat", priority: "medium" },
      { pillarKey: "final_third_involvement", priority: "medium" },
      { pillarKey: "pressing", priority: "low" },
    ],
    minimumRequirements: [{ pillarKey: "progression", minPercentile: 30 }],
    playingStyle: "DRAFT: a wide attacker who takes players on and delivers into the box or cuts inside to shoot — direct, chance-creating output expected.",
    desiredCurrentLevel: 60,
    desiredDevelopmentWindowSeasons: 3,
    intendedRole: "Rotation",
  },

  Striker: {
    desiredQualities: [
      { pillarKey: "goal_threat", priority: "high" },
      { pillarKey: "finishing", priority: "high" },
      { pillarKey: "chance_creation", priority: "medium" },
      { pillarKey: "progression_receptions_carries", priority: "medium" },
      { pillarKey: "pressing", priority: "low" },
    ],
    minimumRequirements: [{ pillarKey: "goal_threat", minPercentile: 30 }],
    playingStyle: "DRAFT: the focal point of the attack — primary goal responsibility, expected to lead the press from the front.",
    desiredCurrentLevel: 62,
    desiredDevelopmentWindowSeasons: 2,
    intendedRole: "Immediate Starter",
  },
};

export const KV_MECHELEN_SUPPORTED_POSITION_GROUPS = Object.keys(KV_MECHELEN_PROFILE);
