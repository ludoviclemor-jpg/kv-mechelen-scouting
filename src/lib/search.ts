import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { searchPlayers, type Player } from "@/lib/players-data";

/**
 * Global search — one box, four categories (Player, Club, Competition,
 * Nationality), each capped small and run in parallel. Not a duplicate
 * of the Players page's own search (which does full server-side
 * pagination over the player table) — this is a fast, cross-domain
 * "where do I even want to go" lookup, meant for the top-of-app search
 * box, not a replacement for any page's own filtering.
 */

export interface GlobalSearchResults {
  players: Player[];
  clubs: string[];
  competitions: { id: string; name: string; area: string | null }[];
  nationalities: string[];
}

const EMPTY_RESULTS: GlobalSearchResults = { players: [], clubs: [], competitions: [], nationalities: [] };

export async function globalSearch(query: string): Promise<GlobalSearchResults> {
  const trimmed = query.trim();
  if (!trimmed) return EMPTY_RESULTS;
  if (!isSupabaseConfigured()) return EMPTY_RESULTS;

  const escaped = trimmed.replace(/[%,()]/g, "");
  const db = getSupabaseClient();

  const [players, clubsRes, competitionsRes, nationalitiesRes] = await Promise.all([
    searchPlayers(trimmed, { limit: 5 }),
    db.from("player_clubs").select("value").ilike("value", `%${escaped}%`).limit(5),
    db
      .from("scoutastic_competitions")
      .select("competition_id,name,area")
      .eq("is_european", true)
      .eq("age_category", "Senior")
      .eq("gender", "male")
      .ilike("name", `%${escaped}%`)
      .limit(5),
    db.from("player_nationalities").select("value").ilike("value", `%${escaped}%`).limit(5),
  ]);

  if (clubsRes.error) throw clubsRes.error;
  if (competitionsRes.error) throw competitionsRes.error;
  if (nationalitiesRes.error) throw nationalitiesRes.error;

  return {
    players,
    clubs: (clubsRes.data ?? []).map((r) => r.value as string),
    competitions: (competitionsRes.data ?? []).map((r) => ({
      id: r.competition_id as string,
      name: r.name as string,
      area: r.area as string | null,
    })),
    nationalities: (nationalitiesRes.data ?? []).map((r) => r.value as string),
  };
}
