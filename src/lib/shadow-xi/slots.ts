import type { ShadowXISlots } from "./types";

/**
 * Pure slot-manipulation helpers — kept separate from ShadowXIView.tsx
 * so the real add/replace/remove/swap/no-duplicates rules are testable
 * without a DOM (this project has no React component-rendering test
 * infrastructure — see src/lib/__tests__/* for the existing "test the
 * logic, not the render" convention this follows).
 */

/** Assigns a player to a slot. If that player already occupies a *different* slot, that other slot is cleared first — the real guarantee against a player unintentionally ending up in the Shadow XI twice, enforced at the data layer rather than only by the picker's exclude-list. */
export function assignPlayerToSlot(slots: ShadowXISlots, slot: string, playerId: string): ShadowXISlots {
  const next: ShadowXISlots = {};
  for (const [key, id] of Object.entries(slots)) {
    if (id !== playerId) next[key] = id;
  }
  next[slot] = playerId;
  return next;
}

export function removePlayerFromSlot(slots: ShadowXISlots, slot: string): ShadowXISlots {
  const next = { ...slots };
  delete next[slot];
  return next;
}

/** Swaps whichever players occupy the two slots — either or both may be empty, in which case this is really just a move. */
export function swapSlots(slots: ShadowXISlots, slotA: string, slotB: string): ShadowXISlots {
  const next = { ...slots };
  const a = next[slotA];
  const b = next[slotB];
  if (b === undefined) delete next[slotA];
  else next[slotA] = b;
  if (a === undefined) delete next[slotB];
  else next[slotB] = a;
  return next;
}
