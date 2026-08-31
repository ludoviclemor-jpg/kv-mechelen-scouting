# AI Scouting Tips

A dashboard widget that turns real, current scouting data into a few
short, actionable tips using Claude — explicitly labelled as AI-generated
in the UI, because it's a genuinely different kind of thing than every
other widget in this app: those are direct views (or plain aggregations)
of real SCOUTASTIC-derived data; this one is LLM commentary *about* that
data.

## Architecture — why this can't run client-side

This is a static export deployed to GitHub Pages — there is no backend
server. Calling an LLM API directly from the browser would mean shipping
the API key in the client bundle, the exact thing this project has
avoided for SCOUTASTIC and Supabase's service_role key throughout. Same
fix as every other data source here: a scheduled script
(`scripts/generate-ai-tips.mjs`, GitHub Actions, `ANTHROPIC_API_KEY` as a
repository secret) does the real work and writes the result to
`ai_scouting_tips`; the frontend only ever reads the most recent row.

```
players / player_scouting_state / player_international_callups (Postgres)
      ↓ scripts/generate-ai-tips.mjs (daily, GitHub Actions)
      ↓ gathers real current data (loan-watch candidates, priority
      ↓ players, recent first call-ups, recent debutants)
      ↓ POST https://api.anthropic.com/v1/messages (claude-haiku-4-5)
ai_scouting_tips   (Postgres — one row per generation run)
      ↓ read at runtime, authenticated-only (db/rls_policies.sql)
Dashboard "AI Scouting Tips" widget (src/components/dashboard/AiTipsWidget.tsx)
```

## Grounding — why this doesn't become a new way to fabricate data

The entire point of this project's data integrity rule is that nothing
gets shown that isn't real. An LLM given a free-form prompt would happily
invent a plausible-sounding transfer rumour or a stat that was never in
the data. The system prompt in `generate-ai-tips.mjs` is deliberately
strict about this:

- The model is given a single JSON object of real data pulled directly
  from this database moments before — nothing else.
- It's explicitly instructed to reference only players/facts/numbers
  that literally appear in that JSON, never to invent a rumour, news
  item, or statistic, and to simply produce fewer tips (or say the data
  is too sparse) rather than pad with generic filler.
- The full `context_summary` that was actually sent is stored alongside
  the generated tips in `ai_scouting_tips`, so any tip can be audited
  against exactly what the model saw.

This makes the output closer to "a human summarizing a report" than "a
new source of facts" — still worth the "AI-generated" label so nobody
mistakes it for a raw SCOUTASTIC field, but not a data-integrity
violation the way inventing a transfer rumour outright would be.

## Cost

`claude-haiku-4-5-20251001` (small model, short prompt, small JSON
context, capped at 1024 output tokens) running once a day — a
predictable, small cost, not a per-page-load one (the frontend never
calls the API directly). `AI_TIPS_MODEL` env var overrides the model if
a higher-quality one is ever wanted for this instead.

## Running it

```bash
# Print the generated tips without writing anything
ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/generate-ai-tips.mjs --dry-run

# Real run
ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/generate-ai-tips.mjs
```

Requires an `ANTHROPIC_API_KEY` — set as a GitHub Actions repository
secret (`.github/workflows/generate-ai-tips.yml`) for the scheduled run,
and in the local shell profile the same way `SCOUTASTIC_API_KEY` already
is for manual/test runs.
