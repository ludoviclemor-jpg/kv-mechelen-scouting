import playerKpisData from "@/data/impect-kvm-player-kpis.json";
import { formatDate } from "@/lib/utils";

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

function dash(v: number | null): string {
  return v === null ? "—" : String(v);
}

/**
 * Every current KV Mechelen player's real Impect season KPIs
 * (2026-09-11) — see scripts/sync-impect-kvm-player-kpis.mjs for the
 * exact source endpoint and KPI selection. A KPI missing for a player
 * (shown as "—") means Impect hasn't computed it for them this season —
 * never shown as 0, since coverage is genuinely sparse for some KPIs
 * (confirmed live: only 4 of 48 players carry GOALS/ASSISTS at all).
 */
export function ImpectKvmPlayerKpisWidget() {
  const { players, fetchedAt } = playerKpisData;

  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-4">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            KV Mechelen Player KPIs — Impect
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            {players.length} players &middot; 26/27 Jupiler Pro League &middot; snapshot {formatDate(fetchedAt)}
          </p>
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto pt-2">
        <table className="data-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th>Min</th>
              <th title="Bypassed Opponents per 90 — sum of opponents no longer able to defend the goal after a pass/dribble by this player">
                Byp. Opp. /90
              </th>
              <th title="Bypassed Defenders per 90 — same, counting only the last 5 outfield defenders">Byp. Def. /90</th>
              <th title="Packing xG per 90 — expected-goal value gained by bypassing opponents">Packing xG /90</th>
              <th>Goals</th>
              <th>Assists</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.playerId}>
                <td className="font-medium text-kvm-ink">{p.name}</td>
                <td className="text-gray-500">{POSITION_LABELS[p.position] ?? p.position}</td>
                <td className="tabular-nums text-gray-600">{p.minutes}</td>
                <td className="tabular-nums text-gray-600">{dash(p.bypassedOpponentsPer90)}</td>
                <td className="tabular-nums text-gray-600">{dash(p.bypassedDefendersPer90)}</td>
                <td className="tabular-nums text-gray-600">{dash(p.packingXgPer90)}</td>
                <td className="tabular-nums text-gray-600">{dash(p.goals)}</td>
                <td className="tabular-nums text-gray-600">{dash(p.assists)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-kvm-border px-5 py-2 text-[11px] text-gray-400">
        Real season-to-date values from Impect&apos;s Data API, not a live feed. &ldquo;&ndash;&rdquo; means Impect
        hasn&apos;t computed that KPI for this player, not zero.
      </p>
    </div>
  );
}
