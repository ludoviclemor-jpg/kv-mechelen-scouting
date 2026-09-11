# Position-Specific Player Rating Model

Deterministic, config-driven Current Level / Potential / Confidence scoring built on real Impect Data API metrics. No generative AI is used anywhere in the numeric calculation or the written explanation.

## Architecture — why TypeScript/Node, not Python

The task that requested this system assumed a Python integration already existed in this repository. It doesn't — confirmed live (no `.py` files, no `requirements.txt`/`pyproject.toml` anywhere). Every existing integration in this project (Scoutastic, Sportmonks, and this session's Impect work) is a plain Node.js `.mjs` script following one consistent convention: read credentials from the environment, call the real API, write results to Supabase, never touch the frontend bundle.

Introducing Python here would mean a second parallel toolchain and, worse, a second API client for the same external API — directly against the brief's own instruction not to duplicate the existing implementation. Instead, this scoring engine is built in plain Node (`scripts/lib/scoring/`), matching every other script in `scripts/`, and the frontend gets a thin, typed reader (`src/lib/scoring-data/`) that only ever displays an already-calculated result. This is the same "browser never talks to the external API or does the heavy computation" principle the brief itself describes for the Python-on-GitHub-Pages case — just implemented in the language this repository actually uses.

```
Impect API
  -> scripts/sync-impect-player-kpis.mjs (already existed)
    -> impect_player_kpis (Supabase)
      -> scripts/calculate-player-ratings.mjs  (new, this feature)
        -> player_ratings (Supabase)
          -> src/lib/scoring-data/remote.ts (Next.js, read-only)
            -> PlayerRatingBreakdown.tsx / PlayerHeader.tsx
```

## Real Impect fields used

Only fields confirmed in this project's own live-fetched catalogs (`docs/impect-kpi-definitions.json`, 1458 entries; `docs/impect-score-definitions.json`, 134 entries) and actually synced into `impect_player_kpis.kpis` today:

| Registry key | Impect field | Kind | Higher is better |
|---|---|---|---|
| `goals` | `GOALS` | volume (per-90'd) | yes |
| `assists` | `ASSISTS` | volume | yes |
| `shots` | `SHOT_AT_GOAL_NUMBER` | volume | yes |
| `shotXg` | `SHOT_XG` | volume | yes |
| `packingXg` | `PACKING_XG` | volume | yes |
| `bypassedOpponents` | `BYPASSED_OPPONENTS` | volume | yes |
| `bypassedDefenders` | `BYPASSED_DEFENDERS` | volume | yes |
| `groundDuelWinPct` | `WON_GROUND_DUELS` / `LOST_GROUND_DUELS` | rate | yes |
| `aerialDuelWinPct` | `WON_AERIAL_DUELS` / `LOST_AERIAL_DUELS` | rate | yes |
| `ballWin` | `BALL_WIN_REMOVED_OPPONENTS` | volume | yes |
| `ballLoss` | `BALL_LOSS_REMOVED_TEAMMATES` | volume | **no** (Impect's own catalog marks this `inverted: true`) |
| `finishing` | `GOALS / SHOT_XG` | derived ratio | yes |

Source of truth: `scripts/lib/scoring/config/metricRegistry.mjs`.

### Fields identified but not yet synced (real, not invented — just not wired up)

Impect's own catalogs contain far more, confirmed real but not currently pulled into `impect_player_kpis`:
- All 13 `GK_*` score fields (shot-stopping, cross claiming, launch accuracy) — this is *why* Goalkeeper isn't scored today.
- `RATIO_PASSING_ACCURACY`, `DRIBBLE_SCORE`, `TOTAL_TOUCHES_IN_PACKING_ZONE_*` (position-specific touch-zone metrics), and ~120 other `Score`-type fields in `docs/impect-score-definitions.json`.

Adding any of these is a two-step change: add the KPI/Score id to the sync script's selection, re-sync, then add it to `metricRegistry.mjs` and reference it from the relevant pillar in `positionPillars.mjs`. Never skip the registry step — a pillar must only reference a key that's actually in the registry (and therefore actually synced).

## Position groups and pillars

Eight groups, matching `src/lib/percentile.ts`'s existing `positionGroup()` mapping (already used by the pizza-chart percentile feature) exactly, duplicated in `scripts/lib/scoring/positionGroup.mjs` for the plain-Node side:

Goalkeeper (unsupported — see above), Centre Back, Fullback, Defensive Midfield, Central Midfield, Attacking Midfield, Winger, Striker.

Full pillar-by-position mapping, with each pillar's real backing metrics and weights (or explicitly `available: false` when no synced metric measures that concept): `scripts/lib/scoring/config/positionPillars.mjs`. Every pillar named in the original brief exists in this file — the ones without real data are visibly `available: false`, not silently dropped or filled with a proxy.

**Pillar-level weighting**: every *available* pillar for a position is weighted equally (1 / number of available pillars). This is a deliberate choice, not a limitation — layering bespoke pillar weights on top of the already-approximate metric-level weights inside each pillar would be a second set of invented numbers with no stronger evidence behind them than "equal."

## Normalization method (`scripts/lib/scoring/normalization.mjs`)

1. Convert volume totals to per-90 using real minutes (`preprocessing.mjs`); rates (duel win %) and the derived finishing ratio are left as rates, never divided by 90 again.
2. Winsorize each value against its cohort at the 2nd/98th percentile (`WINSORIZE_LOW_PERCENTILE`/`WINSORIZE_HIGH_PERCENTILE` in `scoringConfig.mjs`) — one extreme match/season can't dominate a cohort.
3. Percentile-rank the clipped value within the cohort, reversed for `higherIsBetter: false` metrics.
4. Bayesian shrinkage toward 50 using the exact spec formula:
   ```
   reliability = minutes / (minutes + RELIABILITY_CONSTANT)
   adjusted = 50 + reliability * (rawPercentile - 50)
   ```
   `RELIABILITY_CONSTANT = 270` (configurable, `scoringConfig.mjs`) — a 300-minute sample and a 3000-minute sample earning the same raw percentile do not end up equally far from 50.
5. Weighted-average the adjusted metric scores into each pillar, then equally-average available pillars into a raw 0-100 score.
6. Calibrate the raw score against competition strength (see below) into the final Current Level.

## Cohort fallback logic (`scripts/lib/scoring/cohorts.mjs`)

1. Same position group + same competition (iteration) — used whenever it has ≥ `MIN_COHORT_SIZE` (15) comparable players.
2. Same position group + same competition-strength tier — the fallback when level 1 is too small.
3. Same position group across every currently-synced competition — the final fallback.

A fallback firing always adds a `warnings[]` entry and is visible in `context.cohortLevel`. **Known limitation**: this project doesn't yet classify a specific *role* within a position group (e.g. "ball-playing CB" vs. "stopper CB") — `context.role` is the position group name until real role classification exists. `MIN_COHORT_SIZE` is configurable in `scoringConfig.mjs`.

## Competition calibration (`scripts/lib/scoring/competitionStrength.mjs`, `config/competitionStrengthData.mjs`)

`COMPETITION_STRENGTH` is derived from two real, independently published external sources (fetched live 2026-09-11, see `competitionStrengthData.mjs`'s header for full methodology and citations) — not hand-picked:

- **IFFHS's "Strongest Leagues" ranking** — real points for the world's top ~20 domestic leagues.
- **UEFA country coefficients** — real 5-year performance-based ranking for all 55 UEFA associations, converted onto the IFFHS points scale via Belgium's own real numbers in both sources (Belgium is this project's calibration anchor, `multiplier: 1.0, offset: 0`).

For each of these ~90 real competition names (every major domestic league Impect syncs, across every tier of each country's real pyramid — verified against `impect_competitions.country_id`, not guessed from name alone), `multiplier`/`offset` are computed by one formula: `offset = clamp(12 * ln(points / anchorPoints), [-15, 25])`, `multiplier = clamp(1 + 0.15 * ln(points / anchorPoints), [0.7, 1.35])`. A country's lower divisions compound a real, already-established discount ratio once per tier below the top flight — the same 0.85×/-3 ratio this project already used for Belgium's own Challenger Pro League, generalized instead of being Belgium-specific.

**Fixed a real bug this way**: before this data existed, every competition except Belgium's own two used the same weak `DEFAULT_COMPETITION_STRENGTH` (`multiplier: 0.85, offset: -3`) — under which a Current Level of 90+ was *algebraically unreachable* for any player anywhere outside Belgium, since it would require a raw cohort-percentile score above 100. Confirmed live: this is why even a statistically dominant Premier League/LaLiga player's Current Level stayed capped in the 40s-50s regardless of how good their real underlying numbers were.

A competition not covered by either real source (most non-European/non-IFFHS-top-20 leagues, all international tournaments — club-league strength data doesn't describe a one-off national-team tournament — and all youth/reserve competitions, where comparing to senior norms would be a category error) keeps `DEFAULT_COMPETITION_STRENGTH` and a `warnings[]` entry saying so, same honest "unranked" fallback as before, just now covering far fewer of the competitions that actually matter for scouting.

## Potential (`scripts/lib/scoring/potential.mjs`)

`potential = currentLevel + ageUpside`, where `ageUpside` is scaled by:
- A **provisional, position-specific development curve** (`DEVELOPMENT_CURVES` in `scoringConfig.mjs`) — linear decay from a max-upside value at age 18 to 0 at that position's configured peak age (later for Goalkeeper/Centre Back, earlier for Winger/Striker, per the brief's own example).
- Data quality (`avgReliability * dataCompleteness`) — thinner data gets less upside applied.
- A trajectory factor: **0.7 today for every player**, because this project has only ever synced one season per competition so far — there's no real multi-season trend to measure yet. This is the spec's own documented fallback for a single-season sample ("reduce confidence, apply stronger regression"), not a fabricated trend. `hasMultiSeasonData` is already threaded through `service.mjs`'s signature so the richer path activates automatically once historical seasons are synced.

`potential` is mathematically enforced to never fall below `currentLevel` (`Math.max(potential, currentLevel)`). `potentialRange` widens for younger players and thinner data.

## Confidence (`scripts/lib/scoring/confidence.mjs`)

A weighted 0-100 combination of: minutes-based reliability (35%), data completeness (25%), cohort size (20%), whether the competition's strength is explicitly configured (10%), and whether Impect returned a position at all (10%) — with an extra penalty when a cohort fallback fired. Bands: High ≥ 70, Medium ≥ 40, Low below. Kept fully separate from Current Level/Potential — it never itself lowers or raises those scores; it only informs how much weight to put on them (and, via the shrinkage step, thin data already pulls the score itself toward a conservative baseline).

## Explanations (`scripts/lib/scoring/explanations.mjs`)

Deterministic string templates only — no LLM, no paid API. Strengths/weaknesses are pillars at or beyond `STRENGTH_PERCENTILE_THRESHOLD` (75) / `WEAKNESS_PERCENTILE_THRESHOLD` (35), **and only when that pillar's reliability clears `MIN_RELIABILITY_FOR_STRENGTH_WEAKNESS` (0.55)** — an unreliable pillar is never called a strength or weakness, per the brief's explicit rule. Development priorities are the top 3 real weaknesses.

## Known limitations (disclosed, not hidden)

- **Goalkeepers are not scored** — no goalkeeper-specific metric is synced yet (see "fields identified but not yet synced" above). The service returns `ratable: false` with a real reason string, never a fabricated score.
- **No multi-season trajectory** — only one season is synced per competition today; Potential uses the spec's own single-season fallback path.
- **No real role classification** within a position group.
- **No match-level consistency signal** (only season-aggregate KPIs are synced) — "consistency across matches" from the brief isn't incorporated.
- **Competition strength is provisional** for every competition except the two explicitly configured.
- **International-experience data** isn't in Impect's synced fields for this project and isn't used.
- **Physical data** (speed, sprints, distance covered) is real but comes from a genuinely separate source — see "SkillCorner physical data" below — not from Impect, and not part of Current Level's own math.

## How to recalculate ratings

```bash
# One player, one competition
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/calculate-player-ratings.mjs --player-id 45824 --iteration-id 2143

# Every rated-eligible player in one competition
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/calculate-player-ratings.mjs --all --iteration-id 2143

# Just one club within a competition
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/calculate-player-ratings.mjs --all --iteration-id 2143 --squad-id 373

# Preview without writing
... --dry-run
```

Recalculation is needed whenever: new Impect data is synced for that competition, `MODEL_VERSION` changes (bump it in `scoringConfig.mjs` when the methodology changes), or any config file changes (weights, curves, thresholds). There's no automatic trigger yet — this is a manual/CLI step, same as every other sync script in this project; wiring it into a scheduled GitHub Action is a real next step once Impect credentials are added there.

## How to change the model safely

Every tunable value lives in `scripts/lib/scoring/config/*.mjs` — never inside a calculation function. To change weights, thresholds, curves, or competition strength: edit the relevant config file, run the test suite (`npx vitest run scripts/lib/scoring`), then recalculate the competitions you care about. Bump `MODEL_VERSION` in `scoringConfig.mjs` for any change that alters real player-facing scores, so `player_ratings.model_version` stays a meaningful staleness signal.

## How to add a new Impect metric

1. Confirm the real field name and id in `docs/impect-kpi-definitions.json` (KPI) or `docs/impect-score-definitions.json` (Score) — never guess a name.
2. Add its id to `scripts/lib/impectKpis.mjs`'s `KPI_IDS` (for a KPI) and re-sync (`scripts/sync-impect-player-kpis.mjs`), or extend the sync script to also pull `/player-scores` for a Score-type field (not implemented yet — currently only KPIs are synced).
3. Add an entry to `scripts/lib/scoring/config/metricRegistry.mjs` with the real field name, `kind`, and `higherIsBetter` (check the source catalog's own `inverted` flag — don't assume).
4. Reference the new registry key from the relevant pillar(s) in `positionPillars.mjs`, with a weight.
5. Recalculate.

## How to add a new role

Real sub-position-group role classification isn't implemented yet (`context.role` is currently just the position group name). To add it: extend `positionGroup.mjs`'s mapping (or a new module) with a real, Impect-observable signal for the sub-role, then narrow `cohorts.mjs`'s level-1 cohort to also match on it.

## How the frontend retrieves ratings

`src/lib/scoring-data/remote.ts`'s `fetchPlayerRating(scoutasticPlayerId)` reads the most recently calculated row from `player_ratings` via Supabase (RLS: read-only for `authenticated`, write only via the CLI's service_role key — see `db/rls_policies.sql`). The bridge between Impect's own player id space and this project's Scoutastic-based `players` table is real and confirmed live: `impect_players.transfermarkt_id = players.scoutastic_player_id`. The frontend never calls the Impect API and never runs any scoring math itself.

## Technical vs. Physical charts on the player profile

`positionPillars.mjs`'s `pillar()` helper tags every pillar with a `domain` of `"technical"` or `"physical"` — display-only, added 2026-09-11, never affecting a pillar's weight or its contribution to Current Level (see `currentLevel.mjs`). The `"physical"` tag marks Impect's own duel/pressing-based pillars (ground/aerial duel win %, ball win) — the closest real, non-invented signal Impect itself measures toward physicality. `src/components/player-profile/PlayerRatingBreakdown.tsx` renders only `domain === "technical"` pillars in its "Technical Profile" chart/table; the `"physical"`-tagged pillars still count toward the Current Level score shown above the chart, just aren't duplicated into it.

**Real physical data — distance, sprints, high-speed running — comes from SkillCorner, not Impect.** Impect's own KPI (1458 entries, `docs/impect-kpi-definitions.json`) and Score (134 entries, `docs/impect-score-definitions.json`) catalogs were searched exhaustively and contain no speed/sprint/distance-covered metric; its `skillcorner-frame-mappings` endpoints only link video frames to events, not physical stats. SkillCorner (`www.skillcorner.com`, HTTP Basic Auth, real OpenAPI 3.1 spec at `docs/skillcorner-openapi.json`) is a genuinely separate account/API confirmed to have real per-match physical tracking data, including for KV Mechelen's own players (confirmed live: Benito Raman, Rob Schoofs).

- **Sync**: `scripts/sync-skillcorner-competition-editions.mjs` (catalog + resumable `skillcorner_sync_queue`, same pattern as the Impect integration — 1541 real competition editions), then `scripts/sync-skillcorner-physical.mjs` (crawls the queue, fetches `GET /physical/?competition_edition=X&group_by=player&average_per=p90`, writes matched rows to `skillcorner_player_physical`).
- **Bridge**: SkillCorner's `Player` object has no cross-reference id of its own (confirmed against its real schema) — the bridge is an exact match on `(players.name normalized, players.date_of_birth)` against SkillCorner's own denormalized `player_name`/`player_birthdate` fields on each physical row. Confirmed live against two real KV Mechelen players before this was built. A SkillCorner player who doesn't match is skipped, never guessed — see `sync-skillcorner-physical.mjs`'s `loadPlayerBridge`.
- **Frontend**: `src/lib/skillcorner-data/remote.ts`'s `fetchPlayerPhysicalProfile(scoutasticPlayerId)` reads the player's latest synced row plus a real peer pool (same SkillCorner competition edition + SkillCorner's own `position_group`), computing percentiles client-side with the same `percentileRank`/`MIN_POPULATION` (`src/lib/percentile.ts`) used elsewhere in the app. Rendered by `src/components/player-profile/PlayerPhysicalProfile.tsx` as a second, separate radar chart + table on the player profile's Ratings tab.
- **Coverage grows incrementally**: like the Impect crawl, the physical-data queue is resumable and only covers competition editions synced so far — see `scripts/sync-skillcorner-physical.mjs`'s own header for `--batch-size`/`--only` usage.
