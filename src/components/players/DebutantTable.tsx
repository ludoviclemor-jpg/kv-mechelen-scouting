import Link from "next/link";
import type { Player } from "@/lib/players-data";
import { computeMatchStats } from "@/lib/players-data";
import { formatDate, calculateAge } from "@/lib/utils";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Globe2 } from "lucide-react";

export function DebutantTable({ players }: { players: Player[] }) {
  if (players.length === 0) {
    return (
      <EmptyState
        icon={Globe2}
        title="No debutants recorded yet"
        description="African debutants from Eastern European leagues will appear here as SCOUTASTIC detects them."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Nationality</th>
            <th>Age</th>
            <th>Club</th>
            <th>League</th>
            <th>Debut date</th>
            <th>Latest</th>
            <th>Last 5 avg</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const stats = computeMatchStats(player.matches);
            return (
              <tr key={player.id}>
                <td>
                  <Link
                    href={`/players/${player.id}`}
                    className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline"
                  >
                    {player.name}
                  </Link>
                </td>
                <td>{player.nationality}</td>
                <td className="tabular-nums">{calculateAge(player.dateOfBirth) ?? "—"}</td>
                <td>{player.club}</td>
                <td className="text-gray-500">{player.league}</td>
                <td className="text-gray-500">
                  {player.debutDate ? formatDate(player.debutDate) : "—"}
                </td>
                <td>
                  <RatingBadge rating={stats.latest} size="sm" />
                </td>
                <td className="tabular-nums text-gray-700">
                  {stats.average !== null ? stats.average.toFixed(2) : "N/A"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
