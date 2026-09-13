/**
 * Formation definitions — configurable, not eleven hard-coded UI
 * elements. Only "4-2-3-1" is wired up today per the current brief, but
 * adding a second formation later is a new entry here, nothing else.
 * `x`/`y` are percentages of the pitch container (0-100), `x` left-to-
 * right, `y` top (attacking third) to bottom (own goal) — matches how
 * the pitch background itself is drawn in ShadowXIPitch.tsx.
 */

export interface FormationSlot {
  slot: string;
  label: string;
  x: number;
  y: number;
}

export interface Formation {
  id: string;
  name: string;
  positions: FormationSlot[];
}

export const FORMATIONS: Formation[] = [
  {
    id: "4-2-3-1",
    name: "4-2-3-1",
    positions: [
      { slot: "GK", label: "Goalkeeper", x: 50, y: 92 },
      { slot: "RB", label: "Right Back", x: 84, y: 74 },
      { slot: "RCB", label: "Right Centre-Back", x: 62, y: 80 },
      { slot: "LCB", label: "Left Centre-Back", x: 38, y: 80 },
      { slot: "LB", label: "Left Back", x: 16, y: 74 },
      { slot: "RDM", label: "Right Defensive Midfielder", x: 63, y: 58 },
      { slot: "LDM", label: "Left Defensive Midfielder", x: 37, y: 58 },
      { slot: "RW", label: "Right Winger", x: 84, y: 30 },
      { slot: "CAM", label: "Attacking Midfielder", x: 50, y: 38 },
      { slot: "LW", label: "Left Winger", x: 16, y: 30 },
      { slot: "ST", label: "Striker", x: 50, y: 12 },
    ],
  },
];

export const DEFAULT_FORMATION_ID = "4-2-3-1";

export function getFormation(id: string): Formation {
  return FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0];
}
