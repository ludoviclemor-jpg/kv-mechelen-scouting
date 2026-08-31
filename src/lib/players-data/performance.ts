import type { PerformanceSeasonRow } from "./types";

/**
 * Helpers over the real, unreduced `performance_seasons` rows (see
 * scripts/lib/fieldMap.mjs's extractPerformanceSeasons() and
 * docs/PLAYER_PROFILE.md) — everything here is a plain aggregation of
 * real SCOUTASTIC fields, never an invented metric. A category/section
 * with no supporting rows should render nothing, not a zeroed-out
 * placeholder — callers are expected to check `rows.length` themselves.
 */

export interface AggregatedStats {
  matchesPlayed: number;
  starts: number; // matchesPlayed - substitutes — SCOUTASTIC doesn't return a separate "starts" field, this is the one reasonable derivation from what it does return
  substitutes: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  ownGoals: number;
  yellow: number;
  red: number;
  yellowRed: number;
  cleanSheets: number;
  opponentGoalsOnThePitch: number;
}

function sum(rows: PerformanceSeasonRow[], key: keyof PerformanceSeasonRow): number {
  return rows.reduce((total, row) => total + (typeof row[key] === "number" ? (row[key] as number) : 0), 0);
}

export function aggregateStats(rows: PerformanceSeasonRow[]): AggregatedStats {
  const matchesPlayed = sum(rows, "matchesPlayed");
  const substitutes = sum(rows, "substitutes");
  return {
    matchesPlayed,
    starts: Math.max(0, matchesPlayed - substitutes),
    substitutes,
    minutesPlayed: sum(rows, "minutesPlayed"),
    goals: sum(rows, "goals"),
    assists: sum(rows, "assists"),
    ownGoals: sum(rows, "ownGoals"),
    yellow: sum(rows, "yellow"),
    red: sum(rows, "red"),
    yellowRed: sum(rows, "yellowRed"),
    cleanSheets: sum(rows, "cleanSheets"),
    opponentGoalsOnThePitch: sum(rows, "opponentGoalsOnThePitch"),
  };
}

export function clubRows(rows: PerformanceSeasonRow[]): PerformanceSeasonRow[] {
  return rows.filter((r) => !r.isInternational);
}

export function internationalRows(rows: PerformanceSeasonRow[]): PerformanceSeasonRow[] {
  return rows.filter((r) => r.isInternational);
}

/** Seasons with at least one club row, most recent first. */
export function availableSeasons(rows: PerformanceSeasonRow[]): string[] {
  return [...new Set(clubRows(rows).map((r) => r.season))].sort().reverse();
}

export interface CompetitionOption {
  id: string;
  name: string;
}

/** Distinct club competitions played in a given season (or every season if `season` is null), for the profile's competition filter. */
export function competitionsInSeason(rows: PerformanceSeasonRow[], season: string | null): CompetitionOption[] {
  const pool = clubRows(rows).filter((r) => season === null || r.season === season);
  const seen = new Map<string, string>();
  for (const r of pool) {
    if (r.competitionId && !seen.has(r.competitionId)) seen.set(r.competitionId, r.contest ?? r.competitionId);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export interface CapsByLevel {
  level: string;
  caps: number;
  goals: number;
  teamName: string | null;
}

/**
 * International appearances grouped by level ("Senior", "U21", ...),
 * most senior-sounding first isn't attempted — real order is by total
 * caps descending, since that's the more scoutable signal (a player with
 * 40 U21 caps and 1 senior cap is still primarily a U21 story).
 */
export function capsByLevel(rows: PerformanceSeasonRow[], teamNameByLevel?: Map<string, string>): CapsByLevel[] {
  const intl = internationalRows(rows).filter((r) => r.level);
  const byLevel = new Map<string, PerformanceSeasonRow[]>();
  for (const r of intl) {
    const level = r.level as string;
    const list = byLevel.get(level) ?? [];
    list.push(r);
    byLevel.set(level, list);
  }
  return [...byLevel.entries()]
    .map(([level, levelRows]) => ({
      level,
      caps: sum(levelRows, "matchesPlayed"),
      goals: sum(levelRows, "goals"),
      teamName: teamNameByLevel?.get(level) ?? null,
    }))
    .sort((a, b) => b.caps - a.caps);
}
