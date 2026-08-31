import type { ReactNode } from "react";
import type { Player } from "@/lib/players-data";
import type { AggregatedStats } from "@/lib/players-data";

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-kvm-border bg-white px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-kvm-ink tabular-nums">{value}</div>
    </div>
  );
}

function Category({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
    </div>
  );
}

/**
 * Grouped ATTACKING / DISCIPLINE / GOALKEEPING categories — the only
 * three SCOUTASTIC's real performanceSummary fields actually support
 * (confirmed live, see docs/PLAYER_PROFILE.md). PASSING/DEFENDING/DUELS
 * are deliberately never rendered — SCOUTASTIC returns no passing,
 * tackle, or duel data at all, and inventing those categories empty (or
 * worse, guessed) would violate the project's core "never fabricate"
 * rule. GOALKEEPING only renders for goalkeepers — clean sheets /
 * goals conceded are a goalkeeper's own numbers, not a general team
 * defensive record.
 */
export function StatsOverview({ stats, isGoalkeeper }: { stats: AggregatedStats; isGoalkeeper: boolean }) {
  const hasAnyMatches = stats.matchesPlayed > 0;

  if (!hasAnyMatches) {
    return <p className="px-1 py-4 text-sm text-gray-400">No matches in this selection.</p>;
  }

  return (
    <div className="space-y-5">
      <Category title="Attacking">
        <StatTile label="Goals" value={stats.goals} />
        <StatTile label="Assists" value={stats.assists} />
        <StatTile label="Goal contributions" value={stats.goals + stats.assists} />
      </Category>

      {isGoalkeeper ? (
        <Category title="Goalkeeping">
          <StatTile label="Clean sheets" value={stats.cleanSheets} />
          <StatTile label="Goals conceded" value={stats.opponentGoalsOnThePitch} />
        </Category>
      ) : null}

      <Category title="Discipline">
        <StatTile label="Yellow cards" value={stats.yellow} />
        <StatTile label="Red cards" value={stats.red} />
        <StatTile label="2nd yellow" value={stats.yellowRed} />
      </Category>
    </div>
  );
}

/** True for a GK by registered position OR by mainly playing there — mirrors how the rest of the app treats `position` as the primary signal. */
export function isGoalkeeperPlayer(player: Pick<Player, "position">): boolean {
  return player.position === "GK";
}
