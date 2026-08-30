import type { ScoutingNotes, ScoutingStatus, Shortlist } from "@/lib/players-data";

export interface PlayerScoutingState {
  status: ScoutingStatus;
  notes: ScoutingNotes;
}

/**
 * Persistence for the things a scout actually writes: shortlists, status,
 * notes. Player/rating data is never written here — that stays read-only,
 * synced by CI into data/players.json (see docs/SCOUTASTIC_SYNC.md,
 * docs/SOFASCORE_PROVIDER.md).
 *
 * Two implementations: LocalOnlyProvider (today's default — in-memory,
 * resets on reload, zero config) and SupabaseProvider (real persistence,
 * activates automatically once NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are set at build time). AppStoreProvider
 * is the only consumer — components never touch this directly.
 */
export interface PersistenceProvider {
  isConfigured(): boolean;

  loadAll(): Promise<{
    shortlists: Shortlist[];
    playerStates: Map<string, PlayerScoutingState>;
  }>;

  createShortlist(name: string, description: string): Promise<Shortlist>;
  renameShortlist(id: string, name: string): Promise<void>;
  deleteShortlist(id: string): Promise<void>;
  addPlayerToShortlist(shortlistId: string, playerId: string): Promise<void>;
  removePlayerFromShortlist(shortlistId: string, playerId: string): Promise<void>;

  setPlayerStatus(playerId: string, status: ScoutingStatus): Promise<void>;
  setPlayerNotes(playerId: string, notes: ScoutingNotes): Promise<void>;
}
