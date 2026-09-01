import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Position } from "@/lib/players-data";
import type { FirstCallUp } from "./types";

function notConfigured(): never {
  throw new Error(
    "Supabase is not configured — call-up data lives in Postgres, there is no static fallback. See docs/POSTGRES_PERSISTENCE.md."
  );
}

const CALL_UP_COLUMNS =
  "level,team_name,country,first_call_up_date,first_call_up_appeared," +
  "players(id,name,photo_url,date_of_birth,nationality,position,club)";

interface EmbeddedPlayer {
  id: string;
  name: string;
  photo_url: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  position: Position | null;
  club: string | null;
}

interface CallUpRow {
  level: string;
  team_name: string;
  country: string;
  first_call_up_date: string;
  first_call_up_appeared: boolean;
  players: EmbeddedPlayer | EmbeddedPlayer[] | null;
}

function callUpFromRow(row: CallUpRow): FirstCallUp | null {
  // Embedded via the real FK on player_international_callups.player_id —
  // the untyped client can't express cardinality, so this defensively
  // handles either shape rather than assuming which one comes back (same
  // pattern already used for matches' embedded scoutastic_competitions).
  const player = (Array.isArray(row.players) ? row.players[0] : row.players) ?? null;
  if (!player) return null; // shouldn't happen (real FK), but never fabricate a player
  return {
    playerId: player.id,
    playerName: player.name,
    photoUrl: player.photo_url,
    dateOfBirth: player.date_of_birth,
    nationality: player.nationality,
    position: player.position,
    club: player.club,
    level: row.level,
    teamName: row.team_name,
    country: row.country,
    firstCallUpDate: row.first_call_up_date,
    appeared: row.first_call_up_appeared,
  };
}

/**
 * Most recent first call-ups, optionally scoped to one level/country.
 * `level`/`country` omitted or `"all"` means unfiltered on that
 * dimension. Filtered server-side (not client-side after the `limit`
 * cap) — same reasoning as every other filter over a capped/ordered
 * result in this app: client-side filtering after the cap could
 * silently miss real matches further down the date-ordered list.
 */
export async function fetchFirstCallUps(options: { level?: string; country?: string; limit?: number } = {}): Promise<FirstCallUp[]> {
  if (!isSupabaseConfigured()) notConfigured();
  let query = getSupabaseClient().from("player_international_callups").select(CALL_UP_COLUMNS);
  if (options.level && options.level !== "all") query = query.eq("level", options.level);
  if (options.country && options.country !== "all") query = query.eq("country", options.country);
  const { data, error } = await query
    .order("first_call_up_date", { ascending: false })
    .limit(options.limit ?? 20);
  if (error) throw error;
  return (data as unknown as CallUpRow[]).map(callUpFromRow).filter((c): c is FirstCallUp => c !== null);
}

/** Distinct countries with at least one first-call-up record — backs the Country filter dropdown on /call-ups. Reads the bounded `call_up_countries` view (db/schema.sql) rather than every row, same pattern as fetchFilterOptions' nationality/league lists. */
export async function fetchCallUpCountries(): Promise<string[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient().from("call_up_countries").select("value");
  if (error) throw error;
  return (data as { value: string }[]).map((r) => r.value);
}

/** Every first-call-up row for one player (one per level) — powers the player profile's "NEW INTERNATIONAL CALL-UP" banner. */
export async function fetchCallUpsForPlayer(playerId: string): Promise<FirstCallUp[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("player_international_callups")
    .select(CALL_UP_COLUMNS)
    .eq("player_id", playerId)
    .order("first_call_up_date", { ascending: false });
  if (error) throw error;
  return (data as unknown as CallUpRow[]).map(callUpFromRow).filter((c): c is FirstCallUp => c !== null);
}
