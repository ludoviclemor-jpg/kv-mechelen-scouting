import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AiTip, AiTipsDigest } from "./types";

function notConfigured(): never {
  throw new Error(
    "Supabase is not configured — AI tips live in Postgres, there is no static fallback. See docs/POSTGRES_PERSISTENCE.md."
  );
}

/** The single most recent generation run, or null if scripts/generate-ai-tips.mjs hasn't run yet. */
export async function fetchLatestAiTips(): Promise<AiTipsDigest | null> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("ai_scouting_tips")
    .select("generated_at,model,tips")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    generatedAt: data.generated_at as string,
    model: data.model as string,
    tips: (data.tips as unknown as AiTip[]) ?? [],
  };
}
