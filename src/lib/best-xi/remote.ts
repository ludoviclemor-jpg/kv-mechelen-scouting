import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { BestXICandidate } from "./selection";

function notConfigured(): never {
  throw new Error("Supabase is not configured — Data Best XI needs Postgres persistence, no static fallback.");
}

export interface DataCompetitionOption {
  iterationId: number;
  competitionName: string;
  season: string;
  playerCount: number;
}

/**
 * Real competitions/seasons that actually have at least one real,
 * ratable `player_ratings` row — never a static list, and never a
 * competition with zero real coverage (the brief is explicit: "gebruik
 * alleen competities en seizoenen waarvoor daadwerkelijk data
 * beschikbaar is").
 */
export async function fetchDataCompetitionOptions(): Promise<DataCompetitionOption[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const client = getSupabaseClient();
  const { data, error } = await client.from("player_ratings").select("iteration_id").eq("ratable", true);
  if (error) throw error;
  const counts = new Map<number, number>();
  for (const row of data ?? []) counts.set(row.iteration_id, (counts.get(row.iteration_id) ?? 0) + 1);
  const iterationIds = [...counts.keys()];
  if (iterationIds.length === 0) return [];

  const { data: competitions, error: compError } = await client
    .from("impect_competitions")
    .select("iteration_id,competition_name,season")
    .in("iteration_id", iterationIds);
  if (compError) throw compError;

  return (competitions ?? [])
    .map((c) => ({ iterationId: c.iteration_id, competitionName: c.competition_name, season: c.season, playerCount: counts.get(c.iteration_id) ?? 0 }))
    .sort((a, b) => a.competitionName.localeCompare(b.competitionName) || b.season.localeCompare(a.season));
}

interface RatingRowForBestXI {
  scoutastic_player_id: string | null;
  current_level: number | null;
  confidence_score: number;
  context: { position?: string; positionGroup?: string; minutes?: number };
}

interface PlayerIdentityRow {
  id: string;
  name: string;
  club: string | null;
  photo_url: string | null;
}

const CHUNK_SIZE = 150; // PostgREST/Cloudflare real URL-length limits confirmed live this session at larger .in() batches — see scripts/calculate-player-ratings.mjs's identical fetchByIdsChunked

async function fetchPlayerIdentitiesChunked(client: ReturnType<typeof getSupabaseClient>, ids: string[]): Promise<Map<string, PlayerIdentityRow>> {
  const map = new Map<string, PlayerIdentityRow>();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { data, error } = await client.from("players").select("id,name,club,photo_url").in("id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as PlayerIdentityRow[]) map.set(row.id, row);
  }
  return map;
}

/**
 * Real candidate pool for one competition+season — every ratable
 * `player_ratings` row for that `iterationId` meeting `minMinutes`,
 * joined with real player identity. Deliberately reads only
 * `current_level` (the within-competition, Pro-League-calibrated
 * performance score) — never `potential` or `kv_fit`, per the brief's
 * explicit instruction that this selection must not use either.
 */
export async function fetchBestXICandidates(iterationId: number, minMinutes: number): Promise<{ candidates: BestXICandidate[]; calculatedAt: string | null; modelVersion: string | null }> {
  if (!isSupabaseConfigured()) notConfigured();
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("player_ratings")
    .select("scoutastic_player_id,current_level,confidence_score,context,calculated_at,model_version")
    .eq("iteration_id", iterationId)
    .eq("ratable", true)
    .not("scoutastic_player_id", "is", null);
  if (error) throw error;

  const rows = (data ?? []) as (RatingRowForBestXI & { calculated_at: string; model_version: string })[];
  const eligible = rows.filter((r) => (r.context?.minutes ?? 0) >= minMinutes && r.current_level !== null);
  const scoutasticIds = eligible.map((r) => r.scoutastic_player_id as string);
  const playerIds = scoutasticIds.map((id) => `sc-${id}`);
  const identities = await fetchPlayerIdentitiesChunked(client, playerIds);

  const candidates: BestXICandidate[] = [];
  for (const row of eligible) {
    const identity = identities.get(`sc-${row.scoutastic_player_id}`);
    if (!identity || !row.context.position || !row.context.positionGroup) continue; // no real identity or position on file — never guess one
    candidates.push({
      scoutasticPlayerId: row.scoutastic_player_id as string,
      playerName: identity.name,
      club: identity.club,
      photoUrl: identity.photo_url,
      rawPosition: row.context.position,
      positionGroup: row.context.positionGroup,
      performanceScore: row.current_level as number,
      reliability: row.confidence_score / 100,
      minutes: row.context.minutes ?? 0,
    });
  }

  const calculatedAt = rows.length > 0 ? rows.map((r) => r.calculated_at).sort().slice(-1)[0] : null;
  const modelVersion = rows[0]?.model_version ?? null;
  return { candidates, calculatedAt, modelVersion };
}
