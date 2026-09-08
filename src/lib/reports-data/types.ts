export type ScoutingType = "live" | "video";
export type FollowUpAction = "watch_again" | "report_to_staff" | "sign_recommendation" | "discard" | "no_action";

export const SCOUTING_TYPE_LABELS: Record<ScoutingType, string> = {
  live: "Live",
  video: "Video",
};

export const FOLLOW_UP_LABELS: Record<FollowUpAction, string> = {
  watch_again: "Watch again",
  report_to_staff: "Report to staff",
  sign_recommendation: "Recommend signing",
  discard: "Discard",
  no_action: "No action",
};

export const FOLLOW_UP_ACTIONS: FollowUpAction[] = ["watch_again", "report_to_staff", "sign_recommendation", "discard", "no_action"];

/**
 * One dated, per-match scouting report — distinct from the general,
 * always-current `ScoutingNotes` on `player_scouting_state` (see
 * db/schema.sql's `match_reports` table, added 2026-09-08). A player can
 * have many of these over time; general notes stay a single current
 * summary. Private to the scout who wrote it (RLS-enforced, see
 * db/rls_policies.sql).
 */
export interface MatchReport {
  id: string;
  playerId: string; // scoutastic_player_id
  matchId: string | null; // optional soft link into `matches` — null for most reports, see the schema comment
  opponent: string;
  matchDate: string | null; // ISO date
  scoutingType: ScoutingType;
  minutesWatched: number | null;
  positionPlayed: string | null;
  strengths: string;
  weaknesses: string;
  overallRating: number | null; // 1-10, null = not rated
  followUpAction: FollowUpAction;
  createdAt: string;
  updatedAt: string;
}

export interface MatchReportInput {
  matchId?: string | null;
  opponent: string;
  matchDate: string | null;
  scoutingType: ScoutingType;
  minutesWatched: number | null;
  positionPlayed: string | null;
  strengths: string;
  weaknesses: string;
  overallRating: number | null;
  followUpAction: FollowUpAction;
}

export interface MatchReportFilters {
  playerId?: string;
  minRating?: number;
  followUpAction?: FollowUpAction;
  fromDate?: string;
  toDate?: string;
}
