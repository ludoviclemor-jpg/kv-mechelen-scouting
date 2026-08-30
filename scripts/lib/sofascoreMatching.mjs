/**
 * Player-matching scoring helpers, ready for a real SofaScoreProvider's
 * findPlayer() to use internally once one exists (see sofascoreProvider.mjs).
 * Not wired to anything live today — pure functions, no network calls.
 *
 * Signals, in order of weight: name similarity (required baseline),
 * date-of-birth exact match (strongest single signal — very unlikely to
 * collide), nationality match, current-club substring match. Mirrors the
 * safety-first design from a prior verified SofaScore matching script
 * (never silently pick between similarly-scored candidates).
 */

const MATCH_CONFIDENCE_THRESHOLD = 0.75; // top candidate must clear this to auto-match
const AMBIGUOUS_GAP_THRESHOLD = 0.1; // top candidate must beat #2 by at least this much
const PLAUSIBLE_FLOOR = 0.5; // below this, a candidate isn't worth surfacing even for review

function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents: "Gündoğan" -> "gundogan"
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein-based similarity, 0 (nothing alike) to 1 (identical). */
function nameSimilarity(a, b) {
  const s1 = normalizeName(a);
  const s2 = normalizeName(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        s1[i - 1] === s2[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const distance = dp[m][n];
  return 1 - distance / Math.max(m, n);
}

/**
 * @param {{name: string, dateOfBirth: string|null, nationality: string|null, club: string|null}} query
 * @param {{name: string, dateOfBirth?: string|null, nationality?: string|null, club?: string|null}} candidate
 * @returns {number} 0-1 confidence score
 */
function scoreCandidate(query, candidate) {
  let score = nameSimilarity(query.name, candidate.name) * 0.6;

  if (query.dateOfBirth && candidate.dateOfBirth) {
    score += query.dateOfBirth === candidate.dateOfBirth ? 0.25 : -0.15; // wrong DOB is a strong negative signal
  }
  if (query.nationality && candidate.nationality) {
    score += query.nationality.toLowerCase() === candidate.nationality.toLowerCase() ? 0.1 : 0;
  }
  if (query.club && candidate.club) {
    const q = query.club.toLowerCase();
    const c = candidate.club.toLowerCase();
    if (q.includes(c) || c.includes(q)) score += 0.05;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Ranks candidates and decides matched/ambiguous/not_found. Never picks a
 * "best guess" when the top two candidates are too close to call.
 * @param {object} query
 * @param {object[]} candidates
 * @returns {{status: "matched"|"ambiguous"|"not_found", best: object|null, confidence: number|null, reason: string|null}}
 */
export function resolveMatch(query, candidates) {
  const scored = (candidates || [])
    .map((c) => ({ candidate: c, score: scoreCandidate(query, c) }))
    .sort((a, b) => b.score - a.score);

  const plausible = scored.filter((s) => s.score >= PLAUSIBLE_FLOOR);

  if (plausible.length === 0) {
    return {
      status: "not_found",
      best: null,
      confidence: null,
      reason: scored.length === 0 ? "no candidates returned" : `best candidate score ${scored[0].score.toFixed(2)} below plausibility floor ${PLAUSIBLE_FLOOR}`,
    };
  }

  const [top, second] = plausible;
  const confidentlyBest = !second || top.score - second.score >= AMBIGUOUS_GAP_THRESHOLD;

  if (top.score >= MATCH_CONFIDENCE_THRESHOLD && confidentlyBest) {
    return { status: "matched", best: top.candidate, confidence: Math.round(top.score * 100) / 100, reason: null };
  }

  return {
    status: "ambiguous",
    best: null,
    confidence: null,
    reason: second
      ? `top two candidates too close (${top.score.toFixed(2)} vs ${second.score.toFixed(2)}) — needs a human or a stronger signal`
      : `best candidate score ${top.score.toFixed(2)} below match threshold ${MATCH_CONFIDENCE_THRESHOLD} — plausible but not confident enough to auto-assign`,
  };
}

export { normalizeName, nameSimilarity, scoreCandidate, MATCH_CONFIDENCE_THRESHOLD, AMBIGUOUS_GAP_THRESHOLD };
