import { DEFAULT_SHORTLISTS, type Shortlist } from "@/lib/players-data";
import type { PersistenceProvider, PlayerScoutingState } from "./types";

/**
 * Today's default: in-memory only, resets on reload. Exactly matches the
 * app's original Phase 1/2 behavior — this is what runs when no database
 * is configured, so the app keeps working with zero setup.
 */
export function createLocalOnlyProvider(): PersistenceProvider {
  const shortlists: Shortlist[] = DEFAULT_SHORTLISTS.map((s) => ({ ...s, playerIds: [...s.playerIds] }));

  function slugId(name: string) {
    return `sl-${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
  }

  return {
    isConfigured: () => false,

    async loadAll() {
      return { shortlists: shortlists.map((s) => ({ ...s })), playerStates: new Map<string, PlayerScoutingState>() };
    },

    async createShortlist(name, description) {
      const shortlist: Shortlist = {
        id: slugId(name),
        name,
        description,
        createdAt: new Date().toISOString().slice(0, 10),
        playerIds: [],
      };
      shortlists.push(shortlist);
      return shortlist;
    },

    async renameShortlist(id, name) {
      const s = shortlists.find((x) => x.id === id);
      if (s) s.name = name;
    },

    async deleteShortlist(id) {
      const idx = shortlists.findIndex((x) => x.id === id);
      if (idx !== -1) shortlists.splice(idx, 1);
    },

    async addPlayerToShortlist(shortlistId, playerId) {
      const s = shortlists.find((x) => x.id === shortlistId);
      if (s && !s.playerIds.includes(playerId)) s.playerIds.push(playerId);
    },

    async removePlayerFromShortlist(shortlistId, playerId) {
      const s = shortlists.find((x) => x.id === shortlistId);
      if (s) s.playerIds = s.playerIds.filter((id) => id !== playerId);
    },

    async setPlayerStatus() {
      // Local-only provider doesn't persist status server-side; AppStoreProvider
      // keeps its own in-memory override map exactly as before.
    },

    async setPlayerNotes() {
      // Same as above — kept purely in React state by the caller.
    },
  };
}
