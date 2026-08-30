import type { Shortlist } from "@/lib/players-data";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { PersistenceProvider, PlayerScoutingState } from "./types";

/**
 * Real persistence via Supabase (Postgres + auto-generated REST API +
 * Row Level Security — see db/schema.sql, db/rls_policies.sql,
 * docs/POSTGRES_PERSISTENCE.md). Activates automatically once
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are set at
 * build time.
 *
 * As of the authentication work (docs/AUTHENTICATION.md), RLS grants
 * read/write on these tables only to the `authenticated` role — every
 * method here will simply fail (rejected by Postgres, not by this file)
 * if called while signed out. AuthProvider/RequireAuth are what keep the
 * UI from calling these while unauthenticated in the first place.
 *
 * The anon key is *meant* to be public — Next.js inlines NEXT_PUBLIC_*
 * vars into the client bundle by design, and that's fine here: real
 * access control comes from the RLS policies enforced by Postgres itself,
 * not from keeping this key secret. It is not the same kind of credential
 * as SCOUTASTIC_API_KEY/SOFASCORE_API_KEY, which must never reach the
 * browser.
 */
export function createSupabaseProvider(): PersistenceProvider {
  const configured = isSupabaseConfigured();
  const db = () => getSupabaseClient();

  return {
    isConfigured: () => configured,

    async loadAll() {
      if (!configured) return { shortlists: [], playerStates: new Map() };

      const [shortlistsRes, membersRes, statesRes] = await Promise.all([
        db().from("shortlists").select("id,name,description,created_at").order("created_at"),
        db().from("shortlist_players").select("shortlist_id,scoutastic_player_id"),
        db().from("player_scouting_state").select("*"),
      ]);
      if (shortlistsRes.error) throw shortlistsRes.error;
      if (membersRes.error) throw membersRes.error;
      if (statesRes.error) throw statesRes.error;

      const membersByShortlist = new Map<string, string[]>();
      for (const row of membersRes.data ?? []) {
        const list = membersByShortlist.get(row.shortlist_id) ?? [];
        list.push(row.scoutastic_player_id);
        membersByShortlist.set(row.shortlist_id, list);
      }

      const shortlists: Shortlist[] = (shortlistsRes.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        createdAt: row.created_at,
        playerIds: membersByShortlist.get(row.id) ?? [],
      }));

      const playerStates = new Map<string, PlayerScoutingState>();
      for (const row of statesRes.data ?? []) {
        playerStates.set(row.scoutastic_player_id, {
          status: row.status,
          notes: {
            strengths: row.notes_strengths,
            weaknesses: row.notes_weaknesses,
            recommendation: row.notes_recommendation,
            general: row.notes_general,
          },
        });
      }

      return { shortlists, playerStates };
    },

    async createShortlist(name, description) {
      const { data, error } = await db()
        .from("shortlists")
        .insert({ name, description })
        .select("id,name,description,created_at")
        .single();
      if (error) throw error;
      return { id: data.id, name: data.name, description: data.description, createdAt: data.created_at, playerIds: [] };
    },

    async renameShortlist(id, name) {
      const { error } = await db().from("shortlists").update({ name }).eq("id", id);
      if (error) throw error;
    },

    async deleteShortlist(id) {
      const { error } = await db().from("shortlists").delete().eq("id", id);
      if (error) throw error;
    },

    async addPlayerToShortlist(shortlistId, playerId) {
      const { error } = await db()
        .from("shortlist_players")
        .upsert({ shortlist_id: shortlistId, scoutastic_player_id: playerId });
      if (error) throw error;
    },

    async removePlayerFromShortlist(shortlistId, playerId) {
      const { error } = await db()
        .from("shortlist_players")
        .delete()
        .eq("shortlist_id", shortlistId)
        .eq("scoutastic_player_id", playerId);
      if (error) throw error;
    },

    async setPlayerStatus(playerId, status) {
      const { error } = await db()
        .from("player_scouting_state")
        .upsert({ scoutastic_player_id: playerId, status }, { onConflict: "scoutastic_player_id" });
      if (error) throw error;
    },

    async setPlayerNotes(playerId, notes) {
      const { error } = await db().from("player_scouting_state").upsert(
        {
          scoutastic_player_id: playerId,
          notes_strengths: notes.strengths,
          notes_weaknesses: notes.weaknesses,
          notes_recommendation: notes.recommendation,
          notes_general: notes.general,
        },
        { onConflict: "scoutastic_player_id" }
      );
      if (error) throw error;
    },
  };
}
