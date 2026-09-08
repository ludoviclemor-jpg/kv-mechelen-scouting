import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { PlayersSearchFilters, SavedSearch } from "./types";

function notConfigured(): never {
  throw new Error(
    "Database not configured — saved searches need Postgres persistence (see Settings). Nothing has been saved."
  );
}

const COLUMNS = "id,name,filters,created_at,updated_at";

interface SavedSearchRow {
  id: string;
  name: string;
  filters: PlayersSearchFilters;
  created_at: string;
  updated_at: string;
}

function fromRow(row: SavedSearchRow): SavedSearch {
  return { id: row.id, name: row.name, filters: row.filters ?? {}, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** RLS already scopes this to the signed-in scout — see db/rls_policies.sql. */
export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient().from("saved_searches").select(COLUMNS).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as SavedSearchRow[]).map(fromRow);
}

export async function createSavedSearch(name: string, filters: PlayersSearchFilters): Promise<SavedSearch> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("saved_searches")
    .insert({ name, filters })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return fromRow(data as unknown as SavedSearchRow);
}

export async function renameSavedSearch(id: string, name: string): Promise<void> {
  if (!isSupabaseConfigured()) notConfigured();
  const { error } = await getSupabaseClient().from("saved_searches").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  if (!isSupabaseConfigured()) notConfigured();
  const { error } = await getSupabaseClient().from("saved_searches").delete().eq("id", id);
  if (error) throw error;
}
