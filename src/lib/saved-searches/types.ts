/**
 * The exact filter shape the Players page keeps in its own state/URL
 * query (see src/app/(app)/players/page.tsx) — stored as-is in
 * `saved_searches.filters` (jsonb) so saving/restoring a search never
 * needs a separate parsing layer. All fields optional/omittable — a
 * saved search only records whichever filters were actually set.
 */
export interface PlayersSearchFilters {
  search?: string;
  position?: string;
  nationality?: string;
  country?: string;
  competitionId?: string;
  club?: string;
  ageMin?: number | null;
  ageMax?: number | null;
  valueMinEUR?: number | null;
  valueMaxEUR?: number | null;
  contractPreset?: string; // see src/lib/contractPresets.ts — relative, not a hardcoded year
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: PlayersSearchFilters;
  createdAt: string;
  updatedAt: string;
}
