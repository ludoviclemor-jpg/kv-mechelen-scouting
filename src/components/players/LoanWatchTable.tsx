import Link from "next/link";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { calculateAge } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowRightLeft } from "lucide-react";

/** "Limited Game Time" — the real, data-backed half of loan-candidate scouting (see docs/LOAN_WATCH.md). */
export function LoanWatchTable({ players }: { players: Player[] }) {
  if (players.length === 0) {
    return (
      <EmptyState
        icon={ArrowRightLeft}
        title="No players match this threshold"
        description="Try raising the minutes threshold, or clearing the position/age filters."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Position</th>
            <th>Club</th>
            <th>Competition</th>
            <th>Age</th>
            <th>Appearances</th>
            <th>Minutes</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <td>
                <Link href={`/player?id=${p.id}`} className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline">
                  {p.name}
                </Link>
              </td>
              <td>{positionLabel(p.position)}</td>
              <td>{p.club ?? "Unknown"}</td>
              <td className="text-gray-500">{p.league ?? "Unknown"}</td>
              <td className="tabular-nums">{calculateAge(p.dateOfBirth) ?? "—"}</td>
              <td className="tabular-nums">{p.appearances ?? "—"}</td>
              <td className="tabular-nums font-semibold text-kvm-red">{p.minutes ?? "—"}&apos;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
