import type { Shortlist } from "./types";

/**
 * DEMO DATA — initial shortlist set shown before any user interaction.
 * Once PostgreSQL is wired up (Phase 3), this becomes the seed/fallback
 * only; live reads/writes go through the database.
 */
export const DEMO_SHORTLISTS: Shortlist[] = [
  {
    id: "sl-african-talents",
    name: "African Talents",
    description: "Priority African prospects across all monitored leagues.",
    createdAt: "2026-06-01",
    playerIds: ["p01", "p02", "p04", "p05", "p10"],
  },
  {
    id: "sl-eastern-europe",
    name: "Eastern Europe",
    description: "Cross-positional watch list from Eastern European leagues.",
    createdAt: "2026-05-12",
    playerIds: ["p03", "p12", "p15", "p19"],
  },
  {
    id: "sl-centre-backs",
    name: "Centre Backs",
    description: "Centre back recruitment options for the next window.",
    createdAt: "2026-04-18",
    playerIds: ["p03", "p11", "p13", "p20"],
  },
  {
    id: "sl-wingers",
    name: "Wingers",
    description: "Wide attacking options, both flanks.",
    createdAt: "2026-07-03",
    playerIds: ["p02", "p06", "p17", "p24"],
  },
  {
    id: "sl-priority",
    name: "Priority",
    description: "Players flagged Priority status across all positions.",
    createdAt: "2026-08-01",
    playerIds: ["p01", "p04", "p16"],
  },
];
