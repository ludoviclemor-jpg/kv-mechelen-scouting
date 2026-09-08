"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { createKeyedQueue } from "@/lib/keyedQueue";

/**
 * Scouting workspace state: shortlists, status overrides and notes
 * overrides layered on top of the read-only synced player data.
 *
 * Backed by a PersistenceProvider (src/lib/persistence/) — Supabase when
 * configured (real, shared writes, private per scout — see
 * db/rls_policies.sql), otherwise an in-memory fallback that resets on
 * reload. All state is loaded once in bulk on mount and kept in React
 * state after that.
 *
 * Every write below is optimistic (the UI updates immediately) but now
 * awaitable and rollback-safe: each mutator returns
 * `Promise<{ ok: boolean; error?: string }>`, so a caller (e.g.
 * ScoutingNotesCard) can show a real "Saving…" / "Saved" / "Failed" state
 * instead of declaring success before the database confirms it. On
 * failure the optimistic change is rolled back to its exact prior value
 * (not just cleared) so the UI never quietly disagrees with what's
 * actually persisted. Writes to the same entity (same player id / same
 * shortlist id) are serialized via `createKeyedQueue` so two rapid saves
 * can never race over the network and land out of order.
 */

export interface SaveResult {
  ok: boolean;
  error?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

interface AppStoreApi {
  shortlists: Shortlist[];
  statusOverrides: Record<string, ScoutingStatus>;
  notesOverrides: Record<string, ScoutingNotes>;
  isLoading: boolean;
  isPersistent: boolean; // false = in-memory only, changes won't survive a reload
  createShortlist: (name: string, description?: string) => Promise<SaveResult>;
  renameShortlist: (id: string, name: string) => Promise<SaveResult>;
  deleteShortlist: (id: string) => Promise<SaveResult>;
  addPlayerToShortlist: (shortlistId: string, playerId: string) => Promise<SaveResult>;
  removePlayerFromShortlist: (shortlistId: string, playerId: string) => Promise<SaveResult>;
  setPlayerStatus: (playerId: string, status: ScoutingStatus) => Promise<SaveResult>;
  setPlayerNotes: (playerId: string, notes: ScoutingNotes) => Promise<SaveResult>;
}

const AppStoreContext = createContext<AppStoreApi | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const provider = useMemo(() => getPersistenceProvider(), []);
  const queueRef = useRef(createKeyedQueue<string>());
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
    (name: string, description = ""): Promise<SaveResult> => {
      const optimisticId = `pending-${Date.now().toString(36)}`;
      const optimistic: Shortlist = {
        id: optimisticId,
        name,
        description,
        createdAt: new Date().toISOString().slice(0, 10),
        playerIds: [],
      };
      setShortlists((prev) => [...prev, optimistic]);
      return queueRef.current(optimisticId, () => provider.createShortlist(name, description)).then(
        (real) => {
          setShortlists((prev) => prev.map((s) => (s.id === optimisticId ? real : s)));
          return { ok: true };
        },
        (err) => {
          setShortlists((prev) => prev.filter((s) => s.id !== optimisticId));
          console.error("Failed to create shortlist:", err);
          return { ok: false, error: errorMessage(err) };
        }
      );
    },
    [provider]
  );

  const renameShortlist = useCallback(
    (id: string, name: string): Promise<SaveResult> => {
      let previousName: string | undefined;
      setShortlists((prev) =>
        prev.map((s) => {
          if (s.id === id) previousName = s.name;
          return s.id === id ? { ...s, name } : s;
        })
      );
      return queueRef.current(id, () => provider.renameShortlist(id, name)).then(
        () => ({ ok: true }),
        (err) => {
          if (previousName !== undefined) {
            setShortlists((prev) => prev.map((s) => (s.id === id ? { ...s, name: previousName! } : s)));
          }
          console.error("Failed to rename shortlist:", err);
          return { ok: false, error: errorMessage(err) };
        }
      );
    },
    [provider]
  );

  const deleteShortlist = useCallback(
    (id: string): Promise<SaveResult> => {
      let removed: Shortlist | undefined;
      let removedIndex = -1;
      setShortlists((prev) => {
        removedIndex = prev.findIndex((s) => s.id === id);
        removed = prev[removedIndex];
        return prev.filter((s) => s.id !== id);
      });
      return queueRef.current(id, () => provider.deleteShortlist(id)).then(
        () => ({ ok: true }),
        (err) => {
          if (removed) {
            setShortlists((prev) => {
              const next = [...prev];
              next.splice(Math.min(removedIndex, next.length), 0, removed!);
              return next;
            });
          }
          console.error("Failed to delete shortlist:", err);
          return { ok: false, error: errorMessage(err) };
        }
      );
    },
    [provider]
  );

  const addPlayerToShortlist = useCallback(
    (shortlistId: string, playerId: string): Promise<SaveResult> => {
      setShortlists((prev) =>
        prev.map((s) =>
          s.id === shortlistId && !s.playerIds.includes(playerId) ? { ...s, playerIds: [...s.playerIds, playerId] } : s
        )
      );
      return queueRef.current(`${shortlistId}:${playerId}`, () => provider.addPlayerToShortlist(shortlistId, playerId)).then(
        () => ({ ok: true }),
        (err) => {
          setShortlists((prev) =>
            prev.map((s) => (s.id === shortlistId ? { ...s, playerIds: s.playerIds.filter((id) => id !== playerId) } : s))
          );
          console.error("Failed to add player to shortlist:", err);
          return { ok: false, error: errorMessage(err) };
        }
      );
    },
    [provider]
  );

  const removePlayerFromShortlist = useCallback(
    (shortlistId: string, playerId: string): Promise<SaveResult> => {
      let hadPlayer = false;
      setShortlists((prev) =>
        prev.map((s) => {
          if (s.id === shortlistId && s.playerIds.includes(playerId)) hadPlayer = true;
          return s.id === shortlistId ? { ...s, playerIds: s.playerIds.filter((id) => id !== playerId) } : s;
        })
      );
      return queueRef.current(`${shortlistId}:${playerId}`, () => provider.removePlayerFromShortlist(shortlistId, playerId)).then(
        () => ({ ok: true }),
        (err) => {
          if (hadPlayer) {
            setShortlists((prev) =>
              prev.map((s) => (s.id === shortlistId && !s.playerIds.includes(playerId) ? { ...s, playerIds: [...s.playerIds, playerId] } : s))
            );
          }
          console.error("Failed to remove player from shortlist:", err);
          return { ok: false, error: errorMessage(err) };
        }
      );
    },
    [provider]
  );

  const setPlayerStatus = useCallback(
    (playerId: string, status: ScoutingStatus): Promise<SaveResult> => {
      let previous: ScoutingStatus | undefined;
      setStatusOverrides((prev) => {
        previous = prev[playerId];
        return { ...prev, [playerId]: status };
      });
      return queueRef.current(`status:${playerId}`, () => provider.setPlayerStatus(playerId, status)).then(
        () => ({ ok: true }),
        (err) => {
          setStatusOverrides((prev) => {
            const next = { ...prev };
            if (previous === undefined) delete next[playerId];
            else next[playerId] = previous;
            return next;
          });
          console.error("Failed to save player status:", err);
          return { ok: false, error: errorMessage(err) };
        }
      );
    },
    [provider]
  );

  const setPlayerNotes = useCallback(
    (playerId: string, notes: ScoutingNotes): Promise<SaveResult> => {
      let previous: ScoutingNotes | undefined;
      setNotesOverrides((prev) => {
        previous = prev[playerId];
        return { ...prev, [playerId]: notes };
      });
      return queueRef.current(`notes:${playerId}`, () => provider.setPlayerNotes(playerId, notes)).then(
        () => ({ ok: true }),
        (err) => {
          setNotesOverrides((prev) => {
            const next = { ...prev };
            if (previous === undefined) delete next[playerId];
            else next[playerId] = previous;
            return next;
          });
          console.error("Failed to save player notes:", err);
          return { ok: false, error: errorMessage(err) };
        }
      );
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
