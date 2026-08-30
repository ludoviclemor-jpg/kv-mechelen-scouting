# SofaScore provider architecture

Match ratings are a core requirement of this project, but **SofaScore has
no legitimate public API today.** This documents what was found, why the
architecture is built the way it is, and exactly what's needed to switch
on a real provider once one exists — no other code should need to change.

## Legitimate access — investigated, not found

SofaScore's own FAQ states plainly:

> "due to agreements with our data providers, we are unable to share the
> data sources in the form of API endpoints"
> — [sofascore.helpscoutdocs.com/article/129](https://sofascore.helpscoutdocs.com/article/129-does-sofascore-offer-sports-data-api)

Their only sanctioned integration route is a media/corporate widget
partnership (`corporate.sofascore.com/widgets`) — embeddable display
widgets for a website, not a data feed suitable for a matching/rating
pipeline like this one.

Separately, and regardless of the above: direct (non-widget) requests to
`api.sofascore.com` are actively blocked (`403 Forbidden`) from every
network tested — a residential connection, Anthropic's own fetch
infrastructure, and a live GitHub Actions runner (Azure). Same result for
both a community-documented endpoint (`/sport/football/scheduled-events`)
and the undocumented player-rating endpoints, with or without
browser-fingerprint headers or session cookies. This is not something the
architecture below works around — per explicit instruction, this project
does not attempt to bypass anti-bot protection.

**Conclusion:** a real integration needs either a licensed data feed (e.g.
Opta, Wyscout, InStat — SCOUTASTIC's own payload already references an
`optaId` and `skillcornerId`, worth checking if either is reachable
through SCOUTASTIC or a related license) or SofaScore's corporate
partnership team, if their widget offering ever expands to raw data
access. Neither is wired up here — that's a business decision, not an
engineering one.

## Architecture (ready, not connected)

```
scripts/lib/sofascoreProvider.mjs   <- the SofaScoreProvider interface
        ↑ implements
  createNullProvider()              <- the only implementation today:
                                        every method returns "no data"
                                        instantly, no network calls

scripts/lib/sofascoreMatching.mjs   <- name/DOB/nationality/club scoring,
                                        ready for a real provider's
                                        findPlayer() to use internally

scripts/sync-sofascore.mjs          <- batched, resumable, rate-limited
                                        orchestrator. No-ops cleanly when
                                        no provider is configured.

.github/workflows/sync-sofascore.yml <- scheduled + manual trigger,
                                         currently a fast no-op
```

### The interface

```js
findPlayer({ name, dateOfBirth, nationality, club })
  -> { status: "matched"|"ambiguous"|"not_found", sofascorePlayerId, confidence, reason }

getPlayerProfile(sofascorePlayerId) -> object | null
getRecentMatches(sofascorePlayerId, count) -> object[]
getMatchPlayerStatistics(sofascorePlayerId, eventId) -> object | null
getLastFiveRatings(sofascorePlayerId) -> { ratings, average, highest, lowest }
isConfigured() -> boolean
```

Every consumer (the sync script; indirectly the frontend, via
`data/players.json`) depends only on this shape — never on a specific
vendor's API. Adding a real provider means writing one new file that
implements this interface and registering it in
`getSofaScoreProvider()`'s `if` chain; nothing else changes.

### Matching — never auto-assigns an ambiguous profile

`resolveMatch(query, candidates)` in `sofascoreMatching.mjs` scores every
candidate by name similarity (Levenshtein, accent/case-insensitive) plus
bonuses for an exact date-of-birth match, nationality match, and club
overlap. A candidate is only `matched` if it clears a confidence floor
*and* beats the runner-up by a clear margin — otherwise the player is
`ambiguous` (surfaced for a human, or a future stronger signal) rather
than silently guessed. Verified directly (not just written, run) against
five scenarios: a clear DOB-confirmed match, a same-name tie with no other
signals, DOB breaking that same tie, a genuinely unrelated name, and no
candidates at all — see git history for the test output.

### SCOUTASTIC sync never touches SofaScore fields

`scripts/sync-scoutastic.mjs`'s upsert only merges the fields SCOUTASTIC
actually owns (`SCOUTASTIC_FIELDS`); `sofascorePlayerId`,
`sofascoreMatchStatus`, `matches`, the rating aggregates, and local
scouting state (`status`, `notes`) are explicitly preserved from the
existing record on every SCOUTASTIC update. This was a real bug caught
while wiring this up — the original merge did a blanket object spread
that would have reset all of this back to defaults on every SCOUTASTIC
sync.

## Request-volume estimate (for when a provider exists)

Per matched player: ~1 search + ~1–2 event-list pages + up to 5 per-match
statistics calls ≈ 7–8 requests. Per unmatched player: 1 (search only).
Across all 8,454 SCOUTASTIC players with an estimated 60–80% match rate,
that's roughly **45,000–50,000 requests** for a full initial backfill —
far too many for one run, and disrespectful of any real API's rate
limits. The batching design handles this:

- **Never re-search a resolved player.** Once `matched`/`ambiguous`/
  `not_found`, `findPlayer()` is never called again for that player —
  only `--refresh-after-days`-old *matched* players get their ratings
  refreshed (a single `getLastFiveRatings()` call, not a re-search).
- **Bounded batches per run** (`--batch-size`, default 300), prioritizing
  never-tried players first, then the stalest matched ones. At ~7.5
  requests/player × 300 × a 400ms delay, one run is ≈15 minutes.
- **Scheduled, incremental runs** (every few hours) spread the full
  backlog over days rather than one multi-hour job that can time out or
  get rate-limited partway through and lose progress.
- **Retry/backoff on 429/5xx**, mirroring the proven pattern in
  `scoutasticClient.mjs`, expected of any real provider implementation.

## Activating a real provider

1. Implement the `SofaScoreProvider` interface against the real data
   source (e.g. `scripts/lib/optaProvider.mjs`).
2. Add it to the `if` chain in `getSofaScoreProvider()`.
3. Set `SOFASCORE_PROVIDER` (and whatever credentials that provider needs)
   as GitHub Actions repository secrets — never in a committed file, never
   in the frontend.
4. `sync-sofascore.yml` and `sync-sofascore.mjs` need no changes.
