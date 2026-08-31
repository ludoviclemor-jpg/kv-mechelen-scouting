#!/usr/bin/env node
/**
 * AI Scouting Tips — see docs/AI_TIPS.md.
 *
 * Static export + GitHub Pages means there is no live backend that could
 * safely call an LLM API from the browser (the API key would be exposed
 * client-side — the same reason SCOUTASTIC/Supabase service_role keys
 * never touch the frontend). Same pattern as every other data source in
 * this project: a scheduled script (service_role key, GitHub Actions
 * secret) does the real work and writes the result to Postgres; the
 * frontend only ever reads it.
 *
 * Pulls a small amount of *real, current* data from this same database
 * (loan-watch candidates, priority players, recent first call-ups,
 * recent debutants, headline stats) and asks Claude to turn that into a
 * few short, concrete tips for KV Mechelen's scouting staff — grounded
 * tightly in the supplied data via the prompt, explicitly instructed
 * never to invent a player, statistic, or transfer detail beyond what's
 * given. This is commentary/synthesis over real data, not a new source
 * of facts — labelled as AI-generated in the UI for exactly that reason.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/generate-ai-tips.mjs
 *   ANTHROPIC_API_KEY=... ... node scripts/generate-ai-tips.mjs --dry-run   (prints the tips, writes nothing)
 *
 * Credentials are read exclusively from environment variables — never
 * written to any file this script produces, never logged, never printed.
 */

const DEFAULT_MODEL = "claude-haiku-4-5-20251001"; // cheap/fast — this is a short scheduled synthesis job, not a reasoning-heavy task

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--model=")) args.model = a.slice("--model=".length);
  }
  return args;
}

async function fetchAllRows(db, table, columns, build = (q) => q, maxRows = 1000) {
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (rows.length < maxRows) {
    const to = Math.min(from + PAGE - 1, from + (maxRows - rows.length) - 1);
    const { data, error } = await build(db.from(table).select(columns)).range(from, to);
    if (error) return { ok: false, error };
    rows.push(...data);
    if (data.length < to - from + 1) break;
    from += PAGE;
  }
  return { ok: true, data: rows };
}

/** Real, current context — the *only* facts the model is allowed to reason about (see the prompt below). */
async function gatherContext(db) {
  const [loanWatch, priority, callUps, debutants, overview] = await Promise.all([
    fetchAllRows(
      db,
      "players",
      "name,position,club,league,minutes,appearances,market_value_eur",
      (q) => q.eq("active", true).eq("is_youth_or_reserve", false).gt("appearances", 0).lte("minutes", 450).order("minutes", { ascending: true }),
      6
    ),
    fetchAllRows(db, "player_scouting_state", "scoutastic_player_id", (q) => q.eq("status", "priority").order("updated_at", { ascending: false }), 6),
    fetchAllRows(
      db,
      "player_international_callups",
      "level,team_name,first_call_up_date,players(name,club,position)",
      (q) => q.order("first_call_up_date", { ascending: false }),
      6
    ),
    fetchAllRows(
      db,
      "players",
      "name,nationality,club,league,debut_date",
      (q) => q.eq("active", true).eq("is_debutant", true).eq("is_african", true).eq("is_eastern_european_league", true).order("debut_date", { ascending: false }),
      6
    ),
    db.from("players").select("id", { count: "planned", head: true }).eq("active", true),
  ]);

  for (const res of [loanWatch, callUps, debutants]) {
    if (!res.ok) throw new Error(`Failed to load context: ${res.error.message}`);
  }

  // Priority players need their names resolved separately (player_scouting_state only has the id).
  let priorityPlayers = [];
  if (priority.ok && priority.data.length > 0) {
    const ids = priority.data.map((r) => `sc-${r.scoutastic_player_id}`);
    const { data, error } = await db.from("players").select("name,position,club,league").in("id", ids);
    if (error) throw new Error(`Failed to load priority players: ${error.message}`);
    priorityPlayers = data;
  }

  return {
    totalActivePlayers: overview.count ?? null,
    loanWatchCandidates: loanWatch.data,
    priorityPlayers,
    recentFirstCallUps: callUps.data.map((r) => ({
      level: r.level,
      team: r.team_name,
      date: r.first_call_up_date,
      player: Array.isArray(r.players) ? r.players[0] : r.players,
    })),
    recentAfricanDebutants: debutants.data,
  };
}

const SYSTEM_PROMPT = `You are a scouting analyst assistant for KV Mechelen, a Belgian Pro League football club. You will be given a JSON object of real, current data from KV Mechelen's own scouting database. Your job is to turn it into 3-4 short, concrete, actionable tips for the scouting staff.

Hard rules:
- Only ever reference a player, club, statistic, or date that literally appears in the JSON data you are given. Never invent or assume a fact not present in it (no transfer rumours, no news, no stats beyond what's given).
- If the data is too sparse to support a strong tip in some area, say so plainly rather than inventing one, or simply produce fewer tips.
- Keep each tip to 1-2 sentences. Be specific (name real players/clubs from the data), not generic filler.
- Respond with ONLY valid JSON, no markdown, no commentary, in exactly this shape:
{"tips": [{"title": "short label", "detail": "1-2 sentence tip"}]}`;

async function callClaude(apiKey, model, context) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(context, null, 2) }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (typeof text !== "string") throw new Error("Unexpected Anthropic response shape (no text content)");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Model did not return valid JSON: ${text.slice(0, 300)}`);
  }
  if (!Array.isArray(parsed.tips)) throw new Error(`Model JSON missing a "tips" array: ${text.slice(0, 300)}`);
  return parsed.tips;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = args.model || process.env.AI_TIPS_MODEL || DEFAULT_MODEL;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error("No API key. Set the ANTHROPIC_API_KEY environment variable and re-run.");
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — needed to read context data and (unless --dry-run) write the result.");
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  console.log("AI SCOUTING TIPS — GENERATION STARTED");
  const startedAt = Date.now();

  const context = await gatherContext(db);
  console.log(
    `Context gathered: ${context.loanWatchCandidates.length} loan-watch candidates, ${context.priorityPlayers.length} priority players, ` +
      `${context.recentFirstCallUps.length} recent call-ups, ${context.recentAfricanDebutants.length} recent debutants.`
  );

  const tips = await callClaude(anthropicKey, model, context);
  console.log(`Generated ${tips.length} tips using ${model}:`);
  tips.forEach((t, i) => console.log(`  ${i + 1}. ${t.title} — ${t.detail}`));

  if (args.dryRun) {
    console.log("\n(--dry-run: nothing written to Postgres)");
    return;
  }

  const { error } = await db.from("ai_scouting_tips").insert({
    model,
    tips,
    context_summary: context,
  });
  if (error) {
    console.error(`Failed to write tips: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nWritten to ai_scouting_tips. Duration: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
