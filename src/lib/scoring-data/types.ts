/**
 * Frontend-facing shape of a `player_ratings` row — mirrors exactly what
 * scripts/calculate-player-ratings.mjs writes (see its own row-mapping
 * for the source of truth). The frontend never computes a rating itself;
 * it only ever reads an already-calculated one.
 */

export type ConfidenceLabel = "Low" | "Medium" | "High";

export interface RatingPillar {
  key: string;
  label: string;
  available: boolean;
  score: number | null;
  percentile: number | null;
  reliability: number | null;
  weight: number | null;
}

export interface RatingStrengthWeakness {
  pillar: string;
  label: string;
  percentile: number;
}

export interface PlayerRating {
  impectPlayerId: number;
  iterationId: number;
  scoutasticPlayerId: string | null;
  modelVersion: string;
  calculatedAt: string;
  ratable: boolean;
  reason: string | null;
  currentLevel: number | null;
  currentLevelBand: string | null;
  potential: number | null;
  potentialRange: { low: number; high: number } | null;
  overallPercentile: number | null;
  confidence: { score: number; label: ConfidenceLabel; reasons: string[] };
  context: {
    position: string;
    positionGroup: string;
    role: string | null;
    season: string;
    competition: string;
    minutes: number;
    cohortSize: number;
    cohortLevel: string | null;
    age: number | null;
  };
  pillars: RatingPillar[];
  strengths: RatingStrengthWeakness[];
  weaknesses: RatingStrengthWeakness[];
  developmentPriorities: string[];
  explanation: string | null;
  warnings: string[];
}
