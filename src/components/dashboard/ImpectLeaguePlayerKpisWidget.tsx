"use client";

import { useMemo, useState } from "react";
import leagueData from "@/data/impect-league-player-kpis.json";
import { formatDate, compareNumbers, compareStrings, cn } from "@/lib/utils";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useSortableList } from "@/lib/useSortableList";

const POSITION_LABELS: Record<string, string> = {
  GOALKEEPER: "GK",
  CENTRAL_DEFENDER: "CB",
  LEFT_WINGBACK_DEFENDER: "LB",
  RIGHT_WINGBACK_DEFENDER: "RB",
  DEFENSE_MIDFIELD: "DM",
  CENTRAL_MIDFIELD: "CM",
  ATTACKING_MIDFIELD: "AM",
  LEFT_WINGER: "LW",
  RIGHT_WINGER: "RW",
  CENTER_FORWARD: "ST",
};

interface LeaguePlayer {
  playerId: number;
  name: string;
  position: string;
  squadId: number;
  squadName: string;
  birthdate: string | null;
  minutes: number;
  matchShare: number;
  goals: number | null;
  assists: number | null;
  shotsPer90: number | null;
  shotXgPer90: number | null;
  packingXgPer90: number | null;
  bypassedOpponentsPer90: number | null;
  bypassedDefendersPer90: number | null;
  groundDuelWinPercent: number | null;
  aerialDuelWinPercent: number | null;
  ballWinPer90: number | null;
  ballLossPer90: number | null;
  transfermarktId: string | null;
}

function dash(v: number | null, suffix = ""): string {
  return v === null ? "—" : `${v}${suffix}`;
}

type SortKey =
  | "name"
  | "squadName"
  | "minutes"
  | "goals"
  | "assists"
  | "shotXgPer90"
  | "packingXgPer90"
  | "bypassedOpponentsPer90"
  | "bypassedDefendersPer90"
  | "groundDuelWinPercent"
  | "aerialDuelWinPercent"
  | "ballWinPer90";

/**
 * Every player from every club in the 26/27 Jupiler Pro League with real
 * Impect KPIs (2026-09-11 — broadened from KV Mechelen's own squad only
 * after being asked for the whole league; see
 * scripts/sync-impect-league-player-kpis.mjs for the exact source and
 * why this stops at "the league KVM plays in" rather than Impect's full
 * worldwide catalog). Search + club/position filters + sortable columns
 * so 637 rows stay usable rather than one long unfiltered dump.
 */
export function ImpectLeaguePlayerKpisWidget() {
  const { players, fetchedAt, squadCount } = leagueData as { players: LeaguePlayer[]; fetchedAt: string; squadCount: number };

  const [search, setSearch] = useState("");
  const [club, setClub] = useState("all");
  const [position, setPosition] = useState("all");

  const clubs = useMemo(() => Array.from(new Set(players.map((p) => p.squadName))).sort(), [players]);
  const positions = useMemo(() => Array.from(new Set(players.map((p) => p.position))).sort(), [players]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (club !== "all" && p.squadName !== club) return false;
      if (position !== "all" && p.position !== position) return false;
      return true;
    });
  }, [players, search, club, position]);

  const { sorted, sortKey, direction, onSort } = useSortableList<LeaguePlayer, SortKey>(
    filtered,
    {
      name: (a, b) => compareStrings(a.name, b.name),
      squadName: (a, b) => compareStrings(a.squadName, b.squadName),
      minutes: (a, b) => compareNumbers(a.minutes, b.minutes),
      goals: (a, b) => compareNumbers(a.goals, b.goals),
      assists: (a, b) => compareNumbers(a.assists, b.assists),
      shotXgPer90: (a, b) => compareNumbers(a.shotXgPer90, b.shotXgPer90),
      packingXgPer90: (a, b) => compareNumbers(a.packingXgPer90, b.packingXgPer90),
      bypassedOpponentsPer90: (a, b) => compareNumbers(a.bypassedOpponentsPer90, b.bypassedOpponentsPer90),
      bypassedDefendersPer90: (a, b) => compareNumbers(a.bypassedDefendersPer90, b.bypassedDefendersPer90),
      groundDuelWinPercent: (a, b) => compareNumbers(a.groundDuelWinPercent, b.groundDuelWinPercent),
      aerialDuelWinPercent: (a, b) => compareNumbers(a.aerialDuelWinPercent, b.aerialDuelWinPercent),
      ballWinPer90: (a, b) => compareNumbers(a.ballWinPer90, b.ballWinPer90),
    },
    "minutes",
    "desc"
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Player KPIs — Impect</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            {players.length} players &middot; {squadCount} clubs &middot; 26/27 Jupiler Pro League &middot; snapshot{" "}
            {formatDate(fetchedAt)}
          </p>
        </div>
        <span className="text-xs font-semibold tabular-nums text-gray-400">{sorted.length} shown</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player..."
          aria-label="Search players"
          className="w-48 rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm text-kvm-ink focus-visible:outline-none"
        />
        <select
          value={club}
          onChange={(e) => setClub(e.target.value)}
          aria-label="Filter by club"
          className="rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm text-kvm-ink focus-visible:outline-none"
        >
          <option value="all">All clubs</option>
          {clubs.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          aria-label="Filter by position"
          className="rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm text-kvm-ink focus-visible:outline-none"
        >
          <option value="all">All positions</option>
          {positions.map((p) => (
            <option key={p} value={p}>
              {POSITION_LABELS[p] ?? p}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 max-h-[560px] overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortableHeader label="Player" sortKey="name" activeKey={sortKey} direction={direction} onSort={onSort} />
              <SortableHeader label="Club" sortKey="squadName" activeKey={sortKey} direction={direction} onSort={onSort} />
              <th>Pos</th>
              <SortableHeader label="Min" sortKey="minutes" activeKey={sortKey} direction={direction} onSort={onSort} />
              <SortableHeader label="Goals" sortKey="goals" activeKey={sortKey} direction={direction} onSort={onSort} />
              <SortableHeader label="Assists" sortKey="assists" activeKey={sortKey} direction={direction} onSort={onSort} />
              <SortableHeader label="Shot xG/90" sortKey="shotXgPer90" activeKey={sortKey} direction={direction} onSort={onSort} />
              <SortableHeader label="Packing xG/90" sortKey="packingXgPer90" activeKey={sortKey} direction={direction} onSort={onSort} />
              <SortableHeader label="Byp. Opp./90" sortKey="bypassedOpponentsPer90" activeKey={sortKey} direction={direction} onSort={onSort} />
              <SortableHeader label="Byp. Def./90" sortKey="bypassedDefendersPer90" activeKey={sortKey} direction={direction} onSort={onSort} />
              <SortableHeader label="Ground Duel %" sortKey="groundDuelWinPercent" activeKey={sortKey} direction={direction} onSort={onSort} />
              <SortableHeader label="Aerial Duel %" sortKey="aerialDuelWinPercent" activeKey={sortKey} direction={direction} onSort={onSort} />
              <SortableHeader label="Ball Win/90" sortKey="ballWinPer90" activeKey={sortKey} direction={direction} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const isKvm = p.squadName === "KV Mechelen";
              return (
                <tr key={p.playerId} className={cn(isKvm && "bg-kvm-red/5")}>
                  <td className={cn("font-medium", isKvm ? "text-kvm-red" : "text-kvm-ink")}>{p.name}</td>
                  <td className="text-gray-500">{p.squadName}</td>
                  <td className="text-gray-500">{POSITION_LABELS[p.position] ?? p.position}</td>
                  <td className="tabular-nums text-gray-600">{p.minutes}</td>
                  <td className="tabular-nums text-gray-600">{dash(p.goals)}</td>
                  <td className="tabular-nums text-gray-600">{dash(p.assists)}</td>
                  <td className="tabular-nums text-gray-600">{dash(p.shotXgPer90)}</td>
                  <td className="tabular-nums text-gray-600">{dash(p.packingXgPer90)}</td>
                  <td className="tabular-nums text-gray-600">{dash(p.bypassedOpponentsPer90)}</td>
                  <td className="tabular-nums text-gray-600">{dash(p.bypassedDefendersPer90)}</td>
                  <td className="tabular-nums text-gray-600">{dash(p.groundDuelWinPercent, "%")}</td>
                  <td className="tabular-nums text-gray-600">{dash(p.aerialDuelWinPercent, "%")}</td>
                  <td className="tabular-nums text-gray-600">{dash(p.ballWinPer90)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 ? <p className="px-5 py-8 text-center text-sm text-gray-400">No players match this search.</p> : null}
      </div>

      <p className="border-t border-kvm-border px-5 py-2 text-[11px] text-gray-400">
        Real season-to-date values from Impect&apos;s Data API, not a live feed. &ldquo;&ndash;&rdquo; means Impect
        hasn&apos;t computed that KPI for this player, never a fabricated zero. Duel % is won / (won + lost) from
        Impect&apos;s own duel counts.
      </p>
    </div>
  );
}
