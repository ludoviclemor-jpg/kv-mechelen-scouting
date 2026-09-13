import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { ShadowXI, ShadowXISlots } from "./types";

function notConfigured(): never {
  throw new Error("Database not configured — Shadow XI needs Postgres persistence (see Settings). Nothing has been saved.");
}

interface ShadowXIRow {
  shortlist_id: string;
  formation_id: string;
  slots: ShadowXISlots;
  updated_at: string;
}

function fromRow(row: ShadowXIRow): ShadowXI {
  return { shortlistId: row.shortlist_id, formationId: row.formation_id, slots: row.slots ?? {}, updatedAt: row.updated_at };
}

/**
 * One Shadow XI per shortlist. RLS (`owner_id = auth.uid()`) already
 * means this can only ever return the signed-in scout's own row — a
 * scout has no way to even query another scout's Shadow XI, this isn't
 * a client-side filter. `null` means this shortlist has no Shadow XI
 * saved yet, not an error.
 */
export async function fetchShadowXI(shortlistId: string): Promise<ShadowXI | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseClient().from("shadow_xi").select("shortlist_id,formation_id,slots,updated_at").eq("shortlist_id", shortlistId).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as unknown as ShadowXIRow) : null;
}

/** Upserts the full slot map in one write — the caller always sends the complete, already-computed next state (add/replace/remove/swap are all just "compute the new slots object, save it"), never a partial patch, so there's no read-modify-write race between two tabs. */
export async function saveShadowXI(shortlistId: string, formationId: string, slots: ShadowXISlots): Promise<ShadowXI> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("shadow_xi")
    .upsert({ shortlist_id: shortlistId, formation_id: formationId, slots }, { onConflict: "shortlist_id" })
    .select("shortlist_id,formation_id,slots,updated_at")
    .single();
  if (error) throw error;
  return fromRow(data as unknown as ShadowXIRow);
}

/** Empties every slot, keeps the current formation choice. */
export async function clearShadowXI(shortlistId: string, formationId: string): Promise<ShadowXI> {
  return saveShadowXI(shortlistId, formationId, {});
}
