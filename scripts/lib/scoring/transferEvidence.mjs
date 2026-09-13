import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Real transfer-based competition-strength evidence
 * (scripts/analyze-competition-transfers.mjs mines this project's own
 * synced Impect data for players who changed competition_id between
 * consecutive real seasons, see that script's header for the full
 * method) — surfaced here as a disclosed cross-check, NOT blended into
 * `competitionStrengthData.mjs`'s primary multiplier/offset.
 *
 * Real finding (2026-09-13): a weighted least-squares fit of the real
 * transfer deltas (10 real competition pairs directly linked to Jupiler
 * Pro League with n >= 8) against the existing external-source-derived
 * log-ratios produced R² = -0.24 — worse than just predicting the mean.
 * At today's real sample sizes (8-31 transfers per pair) the signal is
 * dominated by noise and real selection effects (a transferred player
 * is never a random sample of their league — see this project's own
 * rating-methodology brief), so numerically blending it into the
 * primary calibration right now would be overfitting, not an
 * improvement. This is the real, disclosed "strong regularization when
 * transfer data is scarce" outcome: regularized all the way to "don't
 * use it as a multiplier yet" rather than a fabricated confident blend.
 * The raw data stays real and available (docs/competition-transfer-
 * deltas.json) for a future refit once more seasons are synced.
 */

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const path = fileURLToPath(new URL("../../../docs/competition-transfer-deltas.json", import.meta.url));
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    cache = new Map(parsed.pairs.map((p) => [`${p.competitionA}|${p.competitionB}`, p]));
  } catch {
    cache = new Map(); // real file missing (analysis never run) — treat as "no evidence", never throw
  }
  return cache;
}

/**
 * Real transfer evidence directly connecting `competitionName` to the
 * Jupiler Pro League (either direction), if any exists with a real
 * sample size — for display/confidence purposes only (see this file's
 * header for why it isn't used to adjust the calibrated score itself).
 */
export function getTransferEvidence(competitionName) {
  const data = load();
  const outbound = data.get(`Jupiler Pro League|${competitionName}`);
  const inbound = data.get(`${competitionName}|Jupiler Pro League`);
  const best = [outbound, inbound].filter(Boolean).sort((a, b) => b.n - a.n)[0];
  if (!best) return null;
  return { n: best.n, meanDeltaZ: best.meanDeltaZ, stdevDeltaZ: best.stdevDeltaZ };
}
