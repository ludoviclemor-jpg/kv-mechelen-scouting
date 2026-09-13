import type { Formation } from "@/lib/shadow-xi";

/**
 * A "Data Best XI" candidate — one real, already-computed
 * `player_ratings` row for one competition+season, never Potential or
 * KV Mechelen Fit (the brief is explicit: this selection uses only the
 * within-competition performance score). `rawPosition` is Impect's own
 * real position code (e.g. "RIGHT_WINGBACK_DEFENDER") — used only to
 * prefer a real side match for the two-slot position groups; Impect's
 * own position taxonomy has no left/right distinction at all for
 * Centre Back or Defensive Midfield, so those two slots are filled by
 * score alone with an arbitrary (disclosed) left/right label.
 */
export interface BestXICandidate {
  scoutasticPlayerId: string;
  playerName: string;
  club: string | null;
  photoUrl: string | null;
  rawPosition: string;
  positionGroup: string;
  performanceScore: number;
  reliability: number;
  minutes: number;
}

export interface SlotSelection {
  slot: string;
  label: string;
  candidate: BestXICandidate | null;
  alternates: BestXICandidate[]; // up to 3, real runners-up for this slot
}

export interface BestXIResult {
  slots: SlotSelection[];
  filledCount: number;
}

/** Which real Impect position group each formation slot draws from, and — for the two real groups Impect's own data actually distinguishes a side for — which raw position code is the real preferred match. */
const SLOT_POSITION_GROUP: Record<string, { group: string; preferredRawPosition?: string }> = {
  GK: { group: "Goalkeeper" },
  RB: { group: "Fullback", preferredRawPosition: "RIGHT_WINGBACK_DEFENDER" },
  LB: { group: "Fullback", preferredRawPosition: "LEFT_WINGBACK_DEFENDER" },
  RCB: { group: "Centre Back" }, // Impect's own position data has no real left/right distinction for centre backs
  LCB: { group: "Centre Back" },
  RDM: { group: "Defensive Midfield" }, // same — no real side distinction in Impect's own data
  LDM: { group: "Defensive Midfield" },
  CAM: { group: "Attacking Midfield" },
  RW: { group: "Winger", preferredRawPosition: "RIGHT_WINGER" },
  LW: { group: "Winger", preferredRawPosition: "LEFT_WINGER" },
  ST: { group: "Striker" },
};

/** Consistent tie-breaker everywhere in this selection: reliability first, then minutes — never a fabricated arbitrary order. */
function compareCandidates(a: BestXICandidate, b: BestXICandidate): number {
  if (a.performanceScore !== b.performanceScore) return b.performanceScore - a.performanceScore;
  if (a.reliability !== b.reliability) return b.reliability - a.reliability;
  return b.minutes - a.minutes;
}

/**
 * Selects the real best available, position-eligible XI for one
 * formation from a real candidate pool. Every candidate belongs to
 * exactly one real Impect position group per season (one
 * `impect_player_kpis` row per player per competition-season, each
 * with one recorded position — confirmed live, 2026-09-13) — so there
 * is no real cross-position competition for the same player to resolve
 * beyond picking a side for the two-slot groups, which this handles by
 * a real preferred-raw-position match first, falling back to score
 * order. No player is ever selected twice.
 */
export function selectBestXI(candidates: BestXICandidate[], formation: Formation): BestXIResult {
  const byGroup = new Map<string, BestXICandidate[]>();
  for (const c of candidates) {
    if (!byGroup.has(c.positionGroup)) byGroup.set(c.positionGroup, []);
    byGroup.get(c.positionGroup)!.push(c);
  }
  for (const list of byGroup.values()) list.sort(compareCandidates);

  const usedPlayerIds = new Set<string>();

  // Slots grouped by their real position group, in the formation's own
  // order, so ties within a group get their preferred-side slot filled
  // first, then the rest by score.
  const slotsByGroup = new Map<string, string[]>();
  for (const pos of formation.positions) {
    const mapping = SLOT_POSITION_GROUP[pos.slot];
    if (!mapping) continue;
    if (!slotsByGroup.has(mapping.group)) slotsByGroup.set(mapping.group, []);
    slotsByGroup.get(mapping.group)!.push(pos.slot);
  }

  const assigned = new Map<string, BestXICandidate>();
  const alternatesBySlot = new Map<string, BestXICandidate[]>();

  for (const [group, slotKeys] of slotsByGroup) {
    const pool = (byGroup.get(group) ?? []).filter((c) => !usedPlayerIds.has(c.scoutasticPlayerId));
    const remainingSlots = [...slotKeys];
    const filledThisGroup: string[] = [];

    // Pass 1: real preferred-side match first, for groups where Impect's own data distinguishes one.
    for (const slotKey of [...remainingSlots]) {
      const preferred = SLOT_POSITION_GROUP[slotKey]?.preferredRawPosition;
      if (!preferred) continue;
      const match = pool.find((c) => c.rawPosition === preferred && !usedPlayerIds.has(c.scoutasticPlayerId));
      if (match) {
        assigned.set(slotKey, match);
        usedPlayerIds.add(match.scoutasticPlayerId);
        filledThisGroup.push(slotKey);
        remainingSlots.splice(remainingSlots.indexOf(slotKey), 1);
      }
    }

    // Pass 2: fill whatever's left in this group with the next-best remaining candidates, in real score order.
    for (const slotKey of remainingSlots) {
      const next = pool.find((c) => !usedPlayerIds.has(c.scoutasticPlayerId));
      if (!next) continue; // real, disclosed empty slot — never filled with an unsuitable player
      assigned.set(slotKey, next);
      usedPlayerIds.add(next.scoutasticPlayerId);
      filledThisGroup.push(slotKey);
    }

    // Alternates: up to 3 real runners-up in this group, shared across its slots (a scout comparing RCB/LCB wants to see the same real bench, not an artificially split one).
    const runnersUp = pool.filter((c) => !usedPlayerIds.has(c.scoutasticPlayerId)).slice(0, 3);
    for (const slotKey of slotKeys) alternatesBySlot.set(slotKey, runnersUp);
  }

  const slots: SlotSelection[] = formation.positions.map((pos) => ({
    slot: pos.slot,
    label: pos.label,
    candidate: assigned.get(pos.slot) ?? null,
    alternates: alternatesBySlot.get(pos.slot) ?? [],
  }));

  return { slots, filledCount: slots.filter((s) => s.candidate !== null).length };
}

export { SLOT_POSITION_GROUP };
