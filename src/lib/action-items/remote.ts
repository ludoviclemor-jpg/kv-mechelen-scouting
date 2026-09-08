import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { ActionItem, ActionItemInput } from "./types";

function notConfigured(): never {
  throw new Error(
    "Database not configured — next actions need Postgres persistence (see Settings). Nothing has been saved."
  );
}

const COLUMNS = "id,description,action_type,scoutastic_player_id,due_date,completed_at,created_at,updated_at";

interface ActionItemRow {
  id: string;
  description: string;
  action_type: ActionItem["actionType"];
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

export async function createActionItem(input: ActionItemInput): Promise<ActionItem> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("action_items")
    .insert({
      description: input.description,
      action_type: input.actionType,
      scoutastic_player_id: input.playerId ?? null,
      due_date: input.dueDate ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return fromRow(data as unknown as ActionItemRow);
}

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
