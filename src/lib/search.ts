import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { searchPlayers, type Player } from "@/lib/players-data";
import { stripAccents } from "@/lib/utils";

/**
 * Global search — one box, four categories (Player, Club, Competition,
 * Nationality), each capped small and run in parallel. Not a duplicate
 * of the Players page's own search (which does full server-side
 * pagination over the player table) — this is a fast, cross-domain
 * "where do I even want to go" lookup, meant for the top-of-app search
 * box, not a replacement for any page's own filtering.
 *
 * Real root-cause investigation (2026-09-11): the search *backend*
 * (RLS policies, table/view existence, the query shapes below) was
 * confirmed live to work correctly. Two real bugs were in this file and
 * its caller instead:
 * 1. This function used `Promise.all` across four independent queries —
 *    a single failing one (e.g. a transient network blip on just the
 *    competitions query) threw away the other three, including any
 *    real player matches already found, and the caller had no way to
 *    tell "genuinely no matches" apart from "the search itself failed".
 *    Fixed below with `Promise.allSettled` — a partial failure now
 *    still returns whatever categories succeeded, plus a real `error`
 *    the UI can show.
 * 2. Postgres `ILIKE` is case-insensitive but not accent-insensitive
 *    ('André' never matched a search for 'andre') — fixed via the real
 *    `unaccent` Postgres extension (db/migrations/2026-09-11_profile_
 *    redesign_shadowxi_search_todos.sql), matched against real
 *    trigger-maintained `name_unaccented`/`club_unaccented` columns.
 */

export interface GlobalSearchResults {
  players: Player[];
  clubs: string[];
  competitions: { id: string; name: string; area: string | null }[];
  nationalities: string[];
  /** Set when at least one of the four category queries genuinely failed — distinct from "no matches", surfaced by the caller. */
  error: string | null;
}

const EMPTY_RESULTS: GlobalSearchResults = { players: [], clubs: [], competitions: [], nationalities: [], error: null };

export async function globalSearch(query: string): Promise<GlobalSearchResults> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return EMPTY_RESULTS;
  if (!isSupabaseConfigured()) return EMPTY_RESULTS;

  const escaped = stripAccents(trimmed.replace(/[%,()]/g, ""));
  const db = getSupabaseClient();

  const [playersRes, clubsRes, competitionsRes, nationalitiesRes] = await Promise.allSettled([
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

  const failures: string[] = [];

  const players = playersRes.status === "fulfilled" ? playersRes.value : (failures.push("players"), []);

  const clubs =
    clubsRes.status === "fulfilled" && !clubsRes.value.error
      ? (clubsRes.value.data ?? []).map((r) => r.value as string)
      : (failures.push("clubs"), []);

  const competitions =
    competitionsRes.status === "fulfilled" && !competitionsRes.value.error
      ? (competitionsRes.value.data ?? []).map((r) => ({ id: r.competition_id as string, name: r.name as string, area: r.area as string | null }))
      : (failures.push("competitions"), []);

  const nationalities =
    nationalitiesRes.status === "fulfilled" && !nationalitiesRes.value.error
      ? (nationalitiesRes.value.data ?? []).map((r) => r.value as string)
      : (failures.push("nationalities"), []);

  return {
    players,
    clubs,
    competitions,
    nationalities,
    error: failures.length > 0 ? `Some results couldn't be loaded (${failures.join(", ")}) — showing what's available.` : null,
  };
}
