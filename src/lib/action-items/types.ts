export type ActionType = "review_player" | "finish_report" | "research_candidate" | "other";

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  review_player: "Review player",
  finish_report: "Finish report",
  research_candidate: "Research candidate",
  other: "Other",
};

export interface ActionItem {
  id: string;
  description: string;
  actionType: ActionType;
  playerId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionItemInput {
  description: string;
  actionType: ActionType;
  playerId?: string | null;
  dueDate?: string | null;
}
