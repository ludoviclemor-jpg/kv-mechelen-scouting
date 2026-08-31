import Link from "next/link";
import type { Player } from "@/lib/players-data";
import { computeMatchStats } from "@/lib/players-data";
import { formatDate, calculateAge } from "@/lib/utils";
import { matchesAgeRange } from "@/lib/agePresets";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Globe2 } from "lucide-react";

// Same DOB-based U23 cutoff as everywhere else (agePresets.ts) — computed
// per-row from real date_of_birth rather than assumed from the caller,
// so the badge stays correct even if this table is ever reused somewhere
// the U23 eligibility isn't already enforced server-side.
const U23 = { min: null, max: 22 } as const;

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
            <th />
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
            const age = calculateAge(player.dateOfBirth);
            const isU23 = matchesAgeRange(age, U23);
            return (
              <tr key={player.id}>
                <td>
                  <Link
                    href={`/player?id=${player.id}`}
                    className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline"
                  >
                    {player.name}
                  </Link>
                </td>
                <td>
                  {isU23 ? (
                    <span className="inline-flex items-center rounded-sm bg-kvm-yellow px-1.5 py-0.5 text-[10px] font-bold text-kvm-ink">
                      U23
                    </span>
                  ) : null}
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
