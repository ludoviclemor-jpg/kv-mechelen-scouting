import type { Player, SyncMeta } from "./types";
import playersData from "../../../data/players.json";

/**
 * Real player data, synced from SCOUTASTIC (see `scripts/sync-scoutastic.mjs`
 * and `docs/SCOUTASTIC_SYNC.md`). `data/players.json` is committed to the
 * repo and rebuilt by the sync workflow — this file only reads it.
 *
 * Never falls back to fictitious data: if no sync has run yet, this is
 * simply an empty array, and the UI must render its existing empty states
 * rather than inventing placeholder players.
 */
export const SYNCED_PLAYERS: Player[] = playersData.players as Player[];

export const SYNC_META: SyncMeta = playersData.meta as SyncMeta;
