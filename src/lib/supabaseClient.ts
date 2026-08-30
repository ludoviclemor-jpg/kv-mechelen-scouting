import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Single shared Supabase client — used by both auth (src/lib/auth/) and
 * persistence (src/lib/persistence/). Supabase recommends exactly one
 * client instance per app; this is that instance.
 *
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are the only
 * Supabase credentials that may ever exist in the browser (see
 * docs/AUTHENTICATION.md) — the anon key is meant to be public; real
 * access control is enforced by Postgres Row Level Security
 * (db/rls_policies.sql), not by keeping this key secret.
 */

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

/** Throws if called when Supabase isn't configured — always check isSupabaseConfigured() first. */
export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY unset)");
  }
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: {
        // Persist the session in localStorage so a browser refresh (or
        // opening a different static page — this is a multi-page static
        // site, not a single SPA session) doesn't log the user out.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
