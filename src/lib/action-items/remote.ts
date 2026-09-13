import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { ActionItem, ActionItemInput, ActionItemUpdate } from "./types";

function notConfigured(): never {
  throw new Error(
    "Database not configured — to-dos need Postgres persistence (see Settings). Nothing has been saved."
  );
}

const COLUMNS = "id,description,action_type,priority,notes,scoutastic_player_id,due_date,completed_at,created_at,updated_at";

interface ActionItemRow {
  id: string;
  description: string;
  action_type: ActionItem["actionType"];
  priority: ActionItem["priority"];
  notes: string | null;
  scoutastic_player_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: ActionItemRow): ActionItem {
  return {
    id: row.id,
    description: row.description,
    actionType: row.action_type,
    priority: row.priority,
    notes: row.notes,
    playerId: row.scoutastic_player_id,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** RLS already scopes this to the signed-in scout — see db/rls_policies.sql. Open items first (soonest due date), then completed ones. */
export async function fetchActionItems(): Promise<ActionItem[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabaseClient()
    .from("action_items")
    .select(COLUMNS)
    .order("completed_at", { ascending: true, nullsFirst: true })
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as unknown as ActionItemRow[]).map(fromRow);
}

/** Every to-do for one specific player — used by the player-profile "+ To-Do" panel. Bounded by that player's own task count, never the whole table. */
export async function fetchActionItemsForPlayer(playerId: string): Promise<ActionItem[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabaseClient()
    .from("action_items")
    .select(COLUMNS)
    .eq("scoutastic_player_id", playerId)
    .order("completed_at", { ascending: true, nullsFirst: true })
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as unknown as ActionItemRow[]).map(fromRow);
}

export async function createActionItem(input: ActionItemInput): Promise<ActionItem> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("action_items")
    .insert({
      description: input.description,
      action_type: input.actionType,
      priority: input.priority ?? "normal",
      notes: input.notes ?? null,
      scoutastic_player_id: input.playerId ?? null,
      due_date: input.dueDate ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return fromRow(data as unknown as ActionItemRow);
}

/** Edits title/priority/notes/deadline — never `completedAt` or `playerId` (use setActionItemCompleted / delete+recreate for those). */
export async function updateActionItem(id: string, patch: ActionItemUpdate): Promise<ActionItem> {
  if (!isSupabaseConfigured()) notConfigured();
  const update: Record<string, unknown> = {};
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  const { data, error } = await getSupabaseClient().from("action_items").update(update).eq("id", id).select(COLUMNS).single();
  if (error) throw error;
  return fromRow(data as unknown as ActionItemRow);
}

/** Also doubles as "reopen" — pass `completed: false`. */
export async function setActionItemCompleted(id: string, completed: boolean): Promise<void> {
  if (!isSupabaseConfigured()) notConfigured();
  const { error } = await getSupabaseClient()
    .from("action_items")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteActionItem(id: string): Promise<void> {
  if (!isSupabaseConfigured()) notConfigured();
  const { error } = await getSupabaseClient().from("action_items").delete().eq("id", id);
  if (error) throw error;
}
