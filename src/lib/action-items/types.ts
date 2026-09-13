export type ActionType = "review_player" | "finish_report" | "research_candidate" | "other";

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  review_player: "Review player",
  finish_report: "Finish report",
  research_candidate: "Research candidate",
  other: "Other",
};

export type ActionPriority = "low" | "normal" | "high";

export const PRIORITY_LABELS: Record<ActionPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

/** Order strongest-first — used to sort same-deadline to-dos by priority. */
export const PRIORITY_RANK: Record<ActionPriority, number> = { high: 0, normal: 1, low: 2 };

/** Optional quick-picks that pre-fill the title, per the To-Do feature spec — freely editable afterwards, never a rigid classification. */
export const TITLE_PRESETS = [
  "Watch full match",
  "Watch live",
  "Write scouting report",
  "Review physical data",
  "Review technical data",
  "Check contract situation",
  "Follow up",
] as const;

export interface ActionItem {
  id: string;
  description: string;
  actionType: ActionType;
  priority: ActionPriority;
  notes: string | null;
  playerId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionItemInput {
  description: string;
  actionType: ActionType;
  priority?: ActionPriority;
  notes?: string | null;
  playerId?: string | null;
  dueDate?: string | null;
}

export interface ActionItemUpdate {
  description?: string;
  priority?: ActionPriority;
  notes?: string | null;
  dueDate?: string | null;
}
