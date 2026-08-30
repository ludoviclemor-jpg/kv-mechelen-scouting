import { createLocalOnlyProvider } from "./localProvider";
import { createSupabaseProvider } from "./supabaseProvider";
import type { PersistenceProvider } from "./types";

export type { PersistenceProvider, PlayerScoutingState } from "./types";

let cached: PersistenceProvider | null = null;

/** Supabase when configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY set at build time), else in-memory only. */
export function getPersistenceProvider(): PersistenceProvider {
  if (cached) return cached;
  const supabase = createSupabaseProvider();
  cached = supabase.isConfigured() ? supabase : createLocalOnlyProvider();
  return cached;
}
