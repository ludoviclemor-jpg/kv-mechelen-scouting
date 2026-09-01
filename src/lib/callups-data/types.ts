/**
 * First international call-ups — see docs/INTERNATIONAL_CALLUPS.md for
 * what this tracks and why it's a genuinely different signal than a
 * player's first appearance/cap.
 */

import type { Position } from "@/lib/players-data";

export interface FirstCallUp {
  playerId: string;
  playerName: string;
  photoUrl: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  position: Position | null;
  club: string | null;
  level: string; // 'Senior' | 'U21' | 'U20' | 'U19' | 'U18' | 'U17' | occasionally something else SCOUTASTIC returns — not a fixed enum
  teamName: string; // e.g. "Belgium", "Morocco U21"
  country: string; // teamName with any trailing " U<number>" stripped, e.g. "Belgium" for both "Belgium" and "Belgium U21" — powers the Country filter
  firstCallUpDate: string; // date, "YYYY-MM-DD"
  appeared: boolean; // did they actually play in that first call-up match, or were they an unused squad member
}

/** The levels this feature can reliably distinguish, per docs/INTERNATIONAL_CALLUPS.md — "All" and "Senior" are the two most useful defaults, the rest are real SCOUTASTIC age_category values. */
export const CALL_UP_LEVELS = ["Senior", "U21", "U20", "U19", "U18", "U17"] as const;
export type CallUpLevel = (typeof CALL_UP_LEVELS)[number];
