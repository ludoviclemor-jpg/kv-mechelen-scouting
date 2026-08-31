import type { MatchLineupPlayer } from "@/lib/matches-data";

/**
 * Turns a real SCOUTASTIC formation string ("4-2-3-1", "4-3-3 Attacking",
 * "3-5-2") into row sizes, using only the leading digit-hyphen pattern —
 * confirmed real values sometimes carry a trailing qualifier word, which
 * this ignores rather than fails on. Returns null for anything that
 * doesn't parse or doesn't sum to 10 outfield players (+1 GK = 11) —
 * callers must treat null as "formation unavailable" and fall back to a
 * plain list, never guess a layout.
 */
export function parseFormation(tactic: string | null): number[] | null {
  if (!tactic) return null;
  const match = tactic.match(/^\d+(-\d+)+/);
  if (!match) return null;
  const rows = match[0].split("-").map(Number);
  if (rows.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  const total = rows.reduce((a, b) => a + b, 0);
  if (total !== 10) return null; // formation numbers exclude the GK by convention
  return rows;
}

export interface PitchRow {
  players: MatchLineupPlayer[];
}

/**
 * Groups a team's starting XI into pitch rows (GK first, then each
 * formation row) using SCOUTASTIC's own `lineUpIdx` as the authoritative
 * order — never invents a layout. Returns null if the formation doesn't
 * parse or the starter count doesn't match 11 (missing/partial lineup
 * data) — the caller shows "Formation unavailable" in that case.
 */
export function buildPitchRows(players: MatchLineupPlayer[], tactic: string | null): PitchRow[] | null {
  const rowSizes = parseFormation(tactic);
  if (!rowSizes) return null;

  const starters = players
    .filter((p) => p.inLineup && p.lineUpIdx !== null)
    .sort((a, b) => (a.lineUpIdx ?? 0) - (b.lineUpIdx ?? 0));

  if (starters.length !== 11) return null;

  const [gk, ...outfield] = starters;
  const rows: PitchRow[] = [{ players: [gk] }];

  let cursor = 0;
  for (const size of rowSizes) {
    rows.push({ players: outfield.slice(cursor, cursor + size) });
    cursor += size;
  }
  return rows;
}
