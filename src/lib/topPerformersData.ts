import { fetchTopPerformers, fetchPlayersByIds, computeMatchStats, ratingTrendSeries, MINIMUM_RATED_MATCHES, type Player } from "@/lib/players-data";
import { fetchTopRatedPlayers, fetchPlayerRecentPerformance } from "@/lib/sportmonks-data";
import type { PlayerCardRatingOverride } from "@/components/players/PlayerCard";

/**
 * Merges the primary ratings slot (`players.matches`/`rating_average` —
 * see docs/SOFASCORE_PROVIDER.md; currently empty for every player since
 * no real provider is connected there yet) with the Sportmonks TEST
 * integration (docs/SPORTMONKS_INTEGRATION.md — Danish Superliga +
 * Scottish Premiership only) into one ranked Top Performers list.
 *
 * Never blended per player — each entry is tagged with which provider it
 * came from (`sourceLabel`), shown as a small badge on the card. A
 * player with real data in both sources only ever appears via the
 * primary slot (the club's main, unscoped source); Sportmonks fills in
 * only the players the primary slot doesn't have anything for.
 */
export interface TopPerformerEntry {
  player: Player;
  rating: PlayerCardRatingOverride | null; // null = use the card's own default (player.matches-derived) computation
}

export async function fetchCombinedTopPerformers(limit = 20): Promise<TopPerformerEntry[]> {
  const primary = await fetchTopPerformers(limit);
  const primaryIds = new Set(primary.map((p) => p.id));

  // Over-fetch a little since some Sportmonks-ranked players may already
  // be covered by the primary slot and get filtered out below.
  const sportmonksRanked = await fetchTopRatedPlayers({ minAppearances: MINIMUM_RATED_MATCHES, limit: limit * 2 });
  const newSportmonksIds = sportmonksRanked.filter((r) => !primaryIds.has(r.playerId)).map((r) => r.playerId);

  const [sportmonksPlayers, sportmonksDetails] = await Promise.all([
    newSportmonksIds.length > 0 ? fetchPlayersByIds(newSportmonksIds) : Promise.resolve([]),
    Promise.all(newSportmonksIds.map((id) => fetchPlayerRecentPerformance(id))),
  ]);
  const playerById = new Map(sportmonksPlayers.map((p) => [p.id, p]));
  const detailById = new Map(newSportmonksIds.map((id, i) => [id, sportmonksDetails[i]]));

  const primaryEntries: TopPerformerEntry[] = primary.map((player) => ({ player, rating: null }));

  const sportmonksEntries: TopPerformerEntry[] = newSportmonksIds
    .filter((id) => playerById.has(id))
    .map((id) => {
      const detail = detailById.get(id)!;
      const mostRecentFirst = detail.ratings;
      return {
        player: playerById.get(id)!,
        rating: {
          average: detail.last5Average,
          latest: mostRecentFirst[0]?.rating ?? null,
          matchesUsed: mostRecentFirst.length,
          trend: [...mostRecentFirst].reverse().map((r) => ({ date: r.matchDate, rating: r.rating })),
          sourceLabel: "Sportmonks",
        },
      };
    });

  return [...primaryEntries, ...sportmonksEntries]
    .sort((a, b) => {
      const avgA = a.rating?.average ?? computeMatchStats(a.player.matches).average ?? -Infinity;
      const avgB = b.rating?.average ?? computeMatchStats(b.player.matches).average ?? -Infinity;
      return avgB - avgA;
    })
    .slice(0, limit);
}

/** Small helper so callers can pull a consistent {average, latest, trend} regardless of source, e.g. for client-side sort/filter. */
export function combinedStats(entry: TopPerformerEntry) {
  return entry.rating ?? { ...computeMatchStats(entry.player.matches), trend: ratingTrendSeries(entry.player.matches), sourceLabel: null as string | null };
}
