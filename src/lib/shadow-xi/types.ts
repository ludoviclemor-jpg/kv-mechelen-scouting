/** `{ [slotKey]: scoutasticPlayerId }` — matches the DB's flat jsonb `slots` column. Only assigned slots are present as keys. */
export type ShadowXISlots = Record<string, string>;

export interface ShadowXI {
  shortlistId: string;
  formationId: string;
  slots: ShadowXISlots;
  updatedAt: string;
}
