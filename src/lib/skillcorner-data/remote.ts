import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { percentileRank } from "@/lib/percentile";
import type { PlayerPhysical } from "./types";

function notConfigured(): never {
  throw new Error("Supabase is not configured — SkillCorner physical data lives in Postgres, no static fallback.");
}

interface PhysicalRow {
  scoutastic_player_id: string;
  competition_edition_id: number;
  skillcorner_player_id: number;
  competition_name: string | null;
  season_name: string | null;
  position: string | null;
  position_group: string | null;
  count_match: number;
  minutes_avg_per_match: number | null;
  total_distance_p90: number | null;
  total_metersperminute: number | null;
  running_distance_p90: number | null;
  hsr_distance_p90: number | null;
  hsr_count_p90: number | null;
  sprint_distance_p90: number | null;
  sprint_count_p90: number | null;
  hi_distance_p90: number | null;
  hi_count_p90: number | null;
  medaccel_count_p90: number | null;
  highaccel_count_p90: number | null;
  meddecel_count_p90: number | null;
  highdecel_count_p90: number | null;
  psv99: number | null;
  psv99_top5: number | null;
  peak_velocity: number | null;
  peak_velocity_top3: number | null;
  updated_at: string;
}

function fromRow(row: PhysicalRow): PlayerPhysical {
  return {
    scoutasticPlayerId: row.scoutastic_player_id,
    competitionEditionId: row.competition_edition_id,
    skillcornerPlayerId: row.skillcorner_player_id,
    competitionName: row.competition_name,
    seasonName: row.season_name,
    position: row.position,
    positionGroup: row.position_group,
    countMatch: row.count_match,
    minutesAvgPerMatch: row.minutes_avg_per_match,
    totalDistanceP90: row.total_distance_p90,
    totalMetersPerMinute: row.total_metersperminute,
    runningDistanceP90: row.running_distance_p90,
    hsrDistanceP90: row.hsr_distance_p90,
    hsrCountP90: row.hsr_count_p90,
    sprintDistanceP90: row.sprint_distance_p90,
    sprintCountP90: row.sprint_count_p90,
    hiDistanceP90: row.hi_distance_p90,
    hiCountP90: row.hi_count_p90,
    medAccelCountP90: row.medaccel_count_p90,
    highAccelCountP90: row.highaccel_count_p90,
    medDecelCountP90: row.meddecel_count_p90,
    highDecelCountP90: row.highdecel_count_p90,
    psv99: row.psv99,
    psv99Top5: row.psv99_top5,
    peakVelocity: row.peak_velocity,
    peakVelocityTop3: row.peak_velocity_top3,
    updatedAt: row.updated_at,
  };
}

/** Metrics shown on the Physical Profile chart — a curated, real subset (not all 20 stored columns) chosen for what a scout actually reads at a glance: overall work rate, high-speed/sprint output, and explosiveness. */
export const PHYSICAL_METRICS = [
  { key: "totalDistanceP90", label: "Distance / 90", unit: "m" },
  { key: "hsrDistanceP90", label: "High-Speed Running / 90", unit: "m" },
  { key: "sprintDistanceP90", label: "Sprint Distance / 90", unit: "m" },
  { key: "sprintCountP90", label: "Sprints / 90", unit: "" },
  { key: "hiCountP90", label: "High-Intensity Actions / 90", unit: "" },
  { key: "highAccelCountP90", label: "High Accelerations / 90", unit: "" },
  { key: "highDecelCountP90", label: "High Decelerations / 90", unit: "" },
  { key: "psv99", label: "Peak Sprint Velocity", unit: "km/h" },
] as const satisfies ReadonlyArray<{ key: keyof PlayerPhysical; label: string; unit: string }>;

export interface PlayerPhysicalProfile {
  physical: PlayerPhysical;
  percentiles: Partial<Record<(typeof PHYSICAL_METRICS)[number]["key"], number | null>>;
  cohortSize: number;
}

/**
 * Real Scoutastic bridge (players.name + players.date_of_birth, confirmed
 * live) — see scripts/sync-skillcorner-physical.mjs's header for why
 * SkillCorner has no cross-reference id of its own. Returns the player's
 * most recently-synced competition edition, with percentiles computed
 * against real peers (same SkillCorner competition edition + position
 * group) — never against the whole database, and never fabricated when
 * the peer pool is too small (see percentile.ts's MIN_POPULATION).
 */
export async function fetchPlayerPhysicalProfile(scoutasticPlayerId: string): Promise<PlayerPhysicalProfile | null> {
  if (!isSupabaseConfigured()) notConfigured();
  const client = getSupabaseClient();

  const { data: rows, error } = await client
    .from("skillcorner_player_physical")
    .select("*")
    .eq("scoutastic_player_id", scoutasticPlayerId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return null;

  const latest = fromRow(rows[0] as unknown as PhysicalRow);

  const { data: peerRows, error: peerError } = await client
    .from("skillcorner_player_physical")
    .select("*")
    .eq("competition_edition_id", latest.competitionEditionId)
    .eq("position_group", latest.positionGroup ?? "")
    .neq("scoutastic_player_id", scoutasticPlayerId);
  if (peerError) throw peerError;

  const peers = (peerRows ?? []).map((r) => fromRow(r as unknown as PhysicalRow));
  const percentiles: PlayerPhysicalProfile["percentiles"] = {};
  for (const metric of PHYSICAL_METRICS) {
    const value = latest[metric.key];
    if (value === null) continue;
    const population = peers.map((p) => p[metric.key]).filter((v): v is number => v !== null);
    percentiles[metric.key] = percentileRank(value, population);
  }

  return { physical: latest, percentiles, cohortSize: peers.length };
}
