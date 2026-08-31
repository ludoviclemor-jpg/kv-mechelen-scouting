/**
 * The confirmed, real rule for "this is a national-team competition, not
 * a club competition" — see docs/INTERNATIONAL_CALLUPS.md for how these
 * four `level_definition` values were confirmed against the live API
 * (and why the similarly-named "International Cup"/"International Youth
 * Cup" values are deliberately excluded — those are club competitions).
 *
 * Single source of truth, imported by both
 * scripts/sync-international-callups.mjs (which competitions to crawl
 * matches for) and scripts/sync-scoutastic.mjs / lib/fieldMap.mjs (which
 * performanceSummary rows on a *player* are international appearances,
 * so club-facing stats never silently include them) — these must never
 * drift apart.
 */
export const INTERNATIONAL_LEVEL_DEFINITIONS = [
  "National Team",
  "National team's qualifiers",
  "Youth National Team Qualifiers",
  "National youth team",
];
