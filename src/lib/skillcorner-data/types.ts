/**
 * Frontend-facing shape of a `skillcorner_player_physical` row — real,
 * per-90-normalized physical performance data from SkillCorner
 * (scripts/sync-skillcorner-physical.mjs). Never computed or estimated
 * client-side. See that script's header for the (name, birthdate) bridge
 * this data is matched through.
 */

export interface PlayerPhysical {
  scoutasticPlayerId: string;
  competitionEditionId: number;
  skillcornerPlayerId: number;
  competitionName: string | null;
  seasonName: string | null;
  position: string | null;
  positionGroup: string | null;
  countMatch: number;
  minutesAvgPerMatch: number | null;
  totalDistanceP90: number | null;
  totalMetersPerMinute: number | null;
  runningDistanceP90: number | null;
  hsrDistanceP90: number | null;
  hsrCountP90: number | null;
  sprintDistanceP90: number | null;
  sprintCountP90: number | null;
  hiDistanceP90: number | null;
  hiCountP90: number | null;
  medAccelCountP90: number | null;
  highAccelCountP90: number | null;
  medDecelCountP90: number | null;
  highDecelCountP90: number | null;
  psv99: number | null;
  psv99Top5: number | null;
  peakVelocity: number | null;
  peakVelocityTop3: number | null;
  updatedAt: string;
}
