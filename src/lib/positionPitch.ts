/**
 * Maps SCOUTASTIC's raw, granular position codes (from `playedPositions`,
 * e.g. "leftcenterback", "attackingmidfieldleft" — confirmed real, see
 * scripts/lib/fieldMap.mjs's extractPlayedPositions()) to an approximate
 * pitch coordinate for the Position Usage view (docs/PLAYER_PROFILE.md).
 *
 * This is deliberately a *pattern-based* classifier, not an exhaustive
 * hardcoded table — SCOUTASTIC's codes only had a handful confirmed
 * directly (a small sample of real players), but they consistently
 * follow a `{side}{role}` / `{role}{side}` concatenation (e.g.
 * "leftback", "rightcenterback", "attackingmidfieldleft"). Pattern
 * matching on that confirmed convention covers variants never directly
 * observed, without pretending certainty for a literal string this
 * project has never actually seen. A code that still doesn't match
 * anything returns `null` — callers must list it as text rather than
 * plot it at a guessed location; see PositionUsagePitch.tsx.
 *
 * Coordinates are percentages: x = 0 (left touchline) to 100 (right
 * touchline), y = 0 (own goal) to 100 (opponent's goal).
 */

export interface PitchCoord {
  x: number;
  y: number;
  label: string; // short on-pitch label, e.g. "RCB", "LAM"
}

type Side = "left" | "right" | "center";

function detectSide(code: string): Side | null {
  if (code.includes("left")) return "left";
  if (code.includes("right")) return "right";
  if (code.includes("center") || code.includes("centre")) return "center";
  return null;
}

function xFor(side: Side | null, spread: number): number {
  if (side === "left") return spread;
  if (side === "right") return 100 - spread;
  return 50;
}

export function pitchCoordinateFor(rawCode: string): PitchCoord | null {
  const code = rawCode.toLowerCase().replace(/[\s_-]/g, "");
  const side = detectSide(code);

  if (code === "goalkeeper") return { x: 50, y: 6, label: "GK" };

  if (code.includes("wingback")) return { x: xFor(side, 10), y: 24, label: side === "left" ? "LWB" : "RWB" };

  if (code.includes("centerback") || code.includes("centreback") || code === "libero" || code.includes("centraldefen")) {
    return { x: xFor(side, 30), y: 16, label: side === "left" ? "LCB" : side === "right" ? "RCB" : "CB" };
  }

  if (code === "leftback" || code === "rightback") return { x: xFor(side, 8), y: 20, label: side === "left" ? "LB" : "RB" };

  if (code.includes("defensivemidfield")) return { x: xFor(side, 28), y: 38, label: side === "left" ? "LDM" : side === "right" ? "RDM" : "DM" };

  if (code === "leftmidfield") return { x: 10, y: 55, label: "LM" };
  if (code === "rightmidfield") return { x: 90, y: 55, label: "RM" };
  if (code.includes("centralmidfield") || code.includes("centremidfield") || code.includes("centermidfield")) {
    return { x: 50, y: 50, label: "CM" };
  }

  if (code.includes("attackingmidfield")) return { x: xFor(side, 28), y: 68, label: side === "left" ? "LAM" : side === "right" ? "RAM" : "AM" };

  if (code === "leftwing") return { x: 8, y: 78, label: "LW" };
  if (code === "rightwing") return { x: 92, y: 78, label: "RW" };

  if (code === "secondstriker") return { x: 50, y: 80, label: "SS" };
  if (code === "striker" || code.includes("centreforward") || code.includes("centerforward")) return { x: 50, y: 90, label: "ST" };

  return null;
}
