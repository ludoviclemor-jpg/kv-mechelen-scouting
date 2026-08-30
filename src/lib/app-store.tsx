"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_SHORTLISTS,
  type ScoutingNotes,
  type ScoutingStatus,
  type Shortlist,
} from "@/lib/players-data";
import { getPersistenceProvider, type PlayerScoutingState } from "@/lib/persistence";

/**
 * Scouting workspace state: shortlists, status overrides and notes
 * overrides layered on top of the read-only synced player data.
 *
 * Backed by a PersistenceProvider (src/lib/persistence/) — Supabase when
 * configured (real, shared, durable writes), otherwise an in-memory
 * fallback that behaves exactly like the original Phase 1/2 build
 * (resets on reload). All state is loaded once in bulk on mount and kept
 * in React state after that — writes update local state immediately
 * (optimistic) and persist in the background; `useEffectiveStatus` /
 * `useEffectiveNotes` stay simple synchronous lookups either way, so no
 * consuming component needs to know which provider is active.
 */

interface AppStoreApi {
  shortlists: Shortlist[];
  statusOverrides: Record<string, ScoutingStatus>;
  notesOverrides: Record<string, ScoutingNotes>;
  isLoading: boolean;
  isPersistent: boolean; // false = in-memory only, changes won't survive a reload
  createShortlist: (name: string, description?: string) => void;
  renameShortlist: (id: string, name: string) => void;
  deleteShortlist: (id: string) => void;
  addPlayerToShortlist: (shortlistId: string, playerId: string) => void;
  removePlayerFromShortlist: (shortlistId: string, playerId: string) => void;
  setPlayerStatus: (playerId: string, status: ScoutingStatus) => void;
  setPlayerNotes: (playerId: string, notes: ScoutingNotes) => void;
}

const AppStoreContext = createContext<AppStoreApi | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const provider = useMemo(() => getPersistenceProvider(), []);
  const [shortlists, setShortlists] = useState<Shortlist[]>(DEFAULT_SHORTLISTS);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ScoutingStatus>>({});
  const [notesOverrides, setNotesOverrides] = useState<Record<string, ScoutingNotes>>({});
  const [isLoading, setIsLoading] = useState(provider.isConfigured());

  useEffect(() => {
    if (!provider.isConfigured()) return; // local provider's initial state is already correct
    let cancelled = false;
    provider
      .loadAll()
      .then(({ shortlists: loaded, playerStates }) => {
        if (cancelled) return;
        setShortlists(loaded);
        const statuses: Record<string, ScoutingStatus> = {};
        const notes: Record<string, ScoutingNotes> = {};
        playerStates.forEach((state: PlayerScoutingState, playerId: string) => {
          statuses[playerId] = state.status;
          notes[playerId] = state.notes;
        });
        setStatusOverrides(statuses);
        setNotesOverrides(notes);
      })
      .catch((err) => console.error("Failed to load persisted scouting data:", err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const createShortlist = useCallback(
    (name: string, description = "") => {
      const optimistic: Shortlist = {
        id: `pending-${Date.now().toString(36)}`,
        name,
        description,
        createdAt: new Date().toISOString().slice(0, 10),
        playerIds: [],
      };
      setShortlists((prev) => [...prev, optimistic]);
      provider
        .createShortlist(name, description)
        .then((real) => setShortlists((prev) => prev.map((s) => (s.id === optimistic.id ? real : s))))
        .catch((err) => console.error("Failed to create shortlist:", err));
    },
    [provider]
  );

  const renameShortlist = useCallback(
    (id: string, name: string) => {
      setShortlists((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
      provider.renameShortlist(id, name).catch((err) => console.error("Failed to rename shortlist:", err));
    },
    [provider]
  );

  const deleteShortlist = useCallback(
    (id: string) => {
      setShortlists((prev) => prev.filter((s) => s.id !== id));
      provider.deleteShortlist(id).catch((err) => console.error("Failed to delete shortlist:", err));
    },
    [provider]
  );

  const addPlayerToShortlist = useCallback(
    (shortlistId: string, playerId: string) => {
      setShortlists((prev) =>
        prev.map((s) =>
          s.id === shortlistId && !s.playerIds.includes(playerId) ? { ...s, playerIds: [...s.playerIds, playerId] } : s
        )
      );
      provider
        .addPlayerToShortlist(shortlistId, playerId)
        .catch((err) => console.error("Failed to add player to shortlist:", err));
    },
    [provider]
  );

  const removePlayerFromShortlist = useCallback(
    (shortlistId: string, playerId: string) => {
      setShortlists((prev) =>
        prev.map((s) => (s.id === shortlistId ? { ...s, playerIds: s.playerIds.filter((id) => id !== playerId) } : s))
      );
      provider
        .removePlayerFromShortlist(shortlistId, playerId)
        .catch((err) => console.error("Failed to remove player from shortlist:", err));
    },
    [provider]
  );

  const setPlayerStatus = useCallback(
    (playerId: string, status: ScoutingStatus) => {
      setStatusOverrides((prev) => ({ ...prev, [playerId]: status }));
      provider.setPlayerStatus(playerId, status).catch((err) => console.error("Failed to save player status:", err));
    },
    [provider]
  );

  const setPlayerNotes = useCallback(
    (playerId: string, notes: ScoutingNotes) => {
      setNotesOverrides((prev) => ({ ...prev, [playerId]: notes }));
      provider.setPlayerNotes(playerId, notes).catch((err) => console.error("Failed to save player notes:", err));
    },
    [provider]
  );

  const value = useMemo<AppStoreApi>(
    () => ({
      shortlists,
      statusOverrides,
      notesOverrides,
      isLoading,
      isPersistent: provider.isConfigured(),
      createShortlist,
      renameShortlist,
      deleteShortlist,
      addPlayerToShortlist,
      removePlayerFromShortlist,
      setPlayerStatus,
      setPlayerNotes,
    }),
    [
      shortlists,
      statusOverrides,
      notesOverrides,
      isLoading,
      provider,
      createShortlist,
      renameShortlist,
      deleteShortlist,
      addPlayerToShortlist,
      removePlayerFromShortlist,
      setPlayerStatus,
      setPlayerNotes,
    ]
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreApi {
  const ctx = useContext(AppStoreContext);
  if (!ctx) {
    throw new Error("useAppStore must be used within AppStoreProvider");
  }
  return ctx;
}

/** Resolves a player's live status: persisted/local override if set, else the synced default. */
export function useEffectiveStatus(playerId: string, baseStatus: ScoutingStatus): ScoutingStatus {
  const { statusOverrides } = useAppStore();
  return statusOverrides[playerId] ?? baseStatus;
}

/** Resolves a player's live notes: persisted/local override if set, else the synced default. */
export function useEffectiveNotes(playerId: string, baseNotes: ScoutingNotes): ScoutingNotes {
  const { notesOverrides } = useAppStore();
  return notesOverrides[playerId] ?? baseNotes;
}
