import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { PlayerRating } from "./types";

/**
 * Reads an already-calculated rating from `player_ratings` — this file
 * never computes anything itself (see docs/SCORING_MODEL.md: the
 * scoring engine only ever runs server-side, in
 * scripts/calculate-player-ratings.mjs). If a player has ratings from
 * more than one competition (played in two synced competitions this
 * season, e.g. league + a separately-synced iteration), the most
 * recently calculated one wins — a real, disclosed simplification, not
 * a full multi-competition picker (yet).
 */

function notConfigured(): never {
  throw new Error("Supabase is not configured — player ratings live in Postgres, no static fallback.");
}

interface RatingRow {
  impect_player_id: number;
  iteration_id: number;
  scoutastic_player_id: string | null;
  model_version: string;
  calculated_at: string;
  ratable: boolean;
  reason: string | null;
  current_level: number | null;
  current_level_band: string | null;
  potential: number | null;
  potential_range_low: number | null;
  potential_range_high: number | null;
  overall_percentile: number | null;
  confidence_score: number;
  confidence_label: PlayerRating["confidence"]["label"];
  confidence_reasons: string[];
  context: PlayerRating["context"];
  kv_fit: PlayerRating["kvMechelenFit"] | null;
  pillars: PlayerRating["pillars"];
  strengths: PlayerRating["strengths"];
  weaknesses: PlayerRating["weaknesses"];
  development_priorities: string[];
  explanation: string | null;
  warnings: string[];
}

function fromRow(row: RatingRow): PlayerRating {
  return {
    impectPlayerId: row.impect_player_id,
    iterationId: row.iteration_id,
    scoutasticPlayerId: row.scoutastic_player_id,
    modelVersion: row.model_version,
    calculatedAt: row.calculated_at,
    ratable: row.ratable,
    reason: row.reason,
    currentLevel: row.current_level,
    currentLevelBand: row.current_level_band,
    potential: row.potential,
    potentialRange:
      row.potential_range_low !== null && row.potential_range_high !== null
        ? { low: row.potential_range_low, high: row.potential_range_high }
        : null,
    overallPercentile: row.overall_percentile,
    confidence: { score: row.confidence_score, label: row.confidence_label, reasons: row.confidence_reasons ?? [] },
    // `kv_fit` is null for rows calculated before v2.0.0 (see
    // scripts/lib/scoring/config/kvMechelenProfile.mjs) or for a
    // position group KV Mechelen has no draft profile for (Goalkeeper) —
    // surfaced as "not supported", never a fabricated score.
    kvMechelenFit: row.kv_fit ?? { supported: false, reason: "No KV Mechelen Fit calculated for this rating yet.", immediateFit: null, developmentFit: null, totalFit: null },
    context: row.context,
    // `domain` fallback: ratings calculated before the technical/physical
    // split (scripts/lib/scoring/config/positionPillars.mjs) have no
    // `domain` field yet in their stored jsonb — default to "technical"
    // until the next `calculate-player-ratings.mjs` run backfills it.
    pillars: (row.pillars ?? []).map((p) => ({ ...p, domain: p.domain ?? "technical" })),
    strengths: row.strengths ?? [],
    weaknesses: row.weaknesses ?? [],
    developmentPriorities: row.development_priorities ?? [],
    explanation: row.explanation,
    warnings: row.warnings ?? [],
  };
}

/**
 * Real Impect/Scoutastic player-id bridge (impect_players.transfermarkt_id = players.scoutastic_player_id, confirmed live) — `scoutasticPlayerId` here is the raw numeric-string id (e.g. "563139"), not the "sc-563139" form used as `players.id`.
 *
 * A player can have `player_ratings` rows from several real competitions
 * at once (e.g. Erling Haaland has rows from 2018/19 Salzburg, 2019/20
 * Dortmund, and current Manchester City — every competition Impect has
 * ever synced KPIs for, not just his current club). Ordering by
 * `calculated_at` alone (the previous approach) is wrong: a batch
 * recalculation computes many of a player's old competitions within the
 * same second, so "most recently calculated" is really just "whichever
 * happened to be last in that batch" — confirmed live, it was picking a
 * 2019/20 Bundesliga row over more recent ones for Haaland, not his
 * current level. Impect's own `iteration_id`s increase monotonically
 * with season within a competition (confirmed live across e.g. Bundesliga
 * 96→139→1025→1411→2147 for 18/19→19/20→24/25→25/26→26/27) — the real,
 * verifiable signal for "which of this player's rated competitions is
 * most recent", not a fabricated heuristic. `ratable` rows are preferred
 * over unratable ones (a thin-sample warning shouldn't outrank a real
 * season score), with `iteration_id` as the real tiebreak within each
 * group and `calculated_at` only as the final fallback.
 */
export async function fetchPlayerRating(scoutasticPlayerId: string): Promise<PlayerRating | null> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("player_ratings")
    .select("*")
    .eq("scoutastic_player_id", scoutasticPlayerId)
    .order("ratable", { ascending: false })
    .order("iteration_id", { ascending: false })
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as unknown as RatingRow) : null;
}
