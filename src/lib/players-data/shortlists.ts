import type { Shortlist } from "./types";

/**
 * Starting shortlist categories, shown before any user interaction.
 * Empty by design — they no longer reference the old fictitious player
 * IDs. PostgreSQL persistence (Phase 3) will replace this seed with real
 * reads/writes.
 */
export const DEFAULT_SHORTLISTS: Shortlist[] = [
  {
    id: "sl-african-talents",
    name: "African Talents",
    description: "Priority African prospects across all monitored leagues.",
    createdAt: "2026-06-01",
    playerIds: [],
  },
  {
    id: "sl-eastern-europe",
    name: "Eastern Europe",
    description: "Cross-positional watch list from Eastern European leagues.",
    createdAt: "2026-05-12",
    playerIds: [],
  },
  {
    id: "sl-centre-backs",
    name: "Centre Backs",
    description: "Centre back recruitment options for the next window.",
    createdAt: "2026-04-18",
    playerIds: [],
  },
  {
    id: "sl-wingers",
    name: "Wingers",
    description: "Wide attacking options, both flanks.",
    createdAt: "2026-07-03",
    playerIds: [],
  },
  {
    id: "sl-priority",
    name: "Priority",
    description: "Players flagged Priority status across all positions.",
    createdAt: "2026-08-01",
    playerIds: [],
  },
];
