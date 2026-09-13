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
  /** Display-only categorization (scripts/lib/scoring/config/positionPillars.mjs) — never changes weight or scoring, only which chart a pillar renders in. */
  domain: "technical" | "physical";
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

export interface KvFitQualityBreakdown {
  pillarKey: string;
  label: string;
  priority: "high" | "medium" | "low";
  score: number;
  percentile: number;
}

export interface KvFitFailedRequirement {
  pillarKey: string;
  label: string;
  minPercentile: number;
  actualPercentile: number;
}

/** Separate from Current Level/Potential — how well this player's real, measured profile matches KV Mechelen's own configurable role profile (scripts/lib/scoring/config/kvMechelenProfile.mjs, explicitly a draft/concept, not verified club policy). */
export interface KvMechelenFit {
  supported: boolean;
  reason: string | null;
  immediateFit: number | null;
  developmentFit: number | null;
  totalFit: number | null;
  intendedRole?: "Immediate Starter" | "Rotation" | "Development";
  playingStyle?: string;
  desiredCurrentLevel?: number;
  desiredDevelopmentWindowSeasons?: number;
  qualityBreakdown?: KvFitQualityBreakdown[];
  failedRequirements?: KvFitFailedRequirement[];
  dataCompleteness?: number;
  profileVersion?: string;
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
  kvMechelenFit: KvMechelenFit;
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
    competitionCalibration?: {
      rawScore: number;
      calibratedScore: number;
      competitionAdjustment: { multiplier: number; offset: number; tier: string };
      realTransferEvidence: { n: number; meanDeltaZ: number; stdevDeltaZ: number | null } | null;
    };
  };
  pillars: RatingPillar[];
  strengths: RatingStrengthWeakness[];
  weaknesses: RatingStrengthWeakness[];
  developmentPriorities: string[];
  explanation: string | null;
  warnings: string[];
}
