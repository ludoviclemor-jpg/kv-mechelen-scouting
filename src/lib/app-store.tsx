"use client";

import {
  createContext,
  useCallback,
  useContext,
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

/**
 * In-memory scouting workspace state: shortlists, status overrides and
 * notes overrides layered on top of the read-only synced player data.
 *
 * Frontend-only by design (per Phase 1/2 scope) — state resets on reload.
 * Phase 3 (PostgreSQL) replaces this provider's internals with real
 * reads/writes; the hook API (`useAppStore`) is what components should
 * keep depending on.
 */

interface AppStoreState {
  shortlists: Shortlist[];
  statusOverrides: Record<string, ScoutingStatus>;
  notesOverrides: Record<string, ScoutingNotes>;
}

interface AppStoreApi extends AppStoreState {
  createShortlist: (name: string, description?: string) => void;
  renameShortlist: (id: string, name: string) => void;
  deleteShortlist: (id: string) => void;
  addPlayerToShortlist: (shortlistId: string, playerId: string) => void;
  removePlayerFromShortlist: (shortlistId: string, playerId: string) => void;
  setPlayerStatus: (playerId: string, status: ScoutingStatus) => void;
  setPlayerNotes: (playerId: string, notes: ScoutingNotes) => void;
}

const AppStoreContext = createContext<AppStoreApi | null>(null);

function slugId(name: string) {
  return `sl-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [shortlists, setShortlists] = useState<Shortlist[]>(DEFAULT_SHORTLISTS);
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, ScoutingStatus>
  >({});
  const [notesOverrides, setNotesOverrides] = useState<
    Record<string, ScoutingNotes>
  >({});

  const createShortlist = useCallback((name: string, description = "") => {
    setShortlists((prev) => [
      ...prev,
      {
        id: slugId(name),
        name,
        description,
        createdAt: new Date().toISOString().slice(0, 10),
        playerIds: [],
      },
    ]);
  }, []);

  const renameShortlist = useCallback((id: string, name: string) => {
    setShortlists((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name } : s))
    );
  }, []);

  const deleteShortlist = useCallback((id: string) => {
    setShortlists((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addPlayerToShortlist = useCallback(
    (shortlistId: string, playerId: string) => {
      setShortlists((prev) =>
        prev.map((s) =>
          s.id === shortlistId && !s.playerIds.includes(playerId)
            ? { ...s, playerIds: [...s.playerIds, playerId] }
            : s
        )
      );
    },
    []
  );

  const removePlayerFromShortlist = useCallback(
    (shortlistId: string, playerId: string) => {
      setShortlists((prev) =>
        prev.map((s) =>
          s.id === shortlistId
            ? { ...s, playerIds: s.playerIds.filter((id) => id !== playerId) }
            : s
        )
      );
    },
    []
  );

  const setPlayerStatus = useCallback(
    (playerId: string, status: ScoutingStatus) => {
      setStatusOverrides((prev) => ({ ...prev, [playerId]: status }));
    },
    []
  );

  const setPlayerNotes = useCallback(
    (playerId: string, notes: ScoutingNotes) => {
      setNotesOverrides((prev) => ({ ...prev, [playerId]: notes }));
    },
    []
  );

  const value = useMemo<AppStoreApi>(
    () => ({
      shortlists,
      statusOverrides,
      notesOverrides,
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
      createShortlist,
      renameShortlist,
      deleteShortlist,
      addPlayerToShortlist,
      removePlayerFromShortlist,
      setPlayerStatus,
      setPlayerNotes,
    ]
  );

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore(): AppStoreApi {
  const ctx = useContext(AppStoreContext);
  if (!ctx) {
    throw new Error("useAppStore must be used within AppStoreProvider");
  }
  return ctx;
}

/** Resolves a player's live status: user override if set, else the demo default. */
export function useEffectiveStatus(
  playerId: string,
  baseStatus: ScoutingStatus
): ScoutingStatus {
  const { statusOverrides } = useAppStore();
  return statusOverrides[playerId] ?? baseStatus;
}

/** Resolves a player's live notes: user override if set, else the demo default. */
export function useEffectiveNotes(
  playerId: string,
  baseNotes: ScoutingNotes
): ScoutingNotes {
  const { notesOverrides } = useAppStore();
  return notesOverrides[playerId] ?? baseNotes;
}
