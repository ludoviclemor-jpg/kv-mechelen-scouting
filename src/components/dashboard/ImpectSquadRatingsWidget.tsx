import ratingsData from "@/data/impect-squad-ratings.json";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * First real Impect Data API integration (2026-09-11) — real, dated
 * team-strength ratings for the Jupiler Pro League, from
 * `GET /v5/customerapi/iterations/{id}/squads/ratings` (confirmed live,
 * see docs/impect-openapi-v4.1.2.json). Imported directly from a
 * committed JSON snapshot (src/data/impect-squad-ratings.json,
 * refreshed by scripts/sync-impect-squad-ratings.mjs) rather than a
 * runtime Supabase read — the per-scout-privacy DB migration this
 * project's schema depends on hasn't reached production yet, so this
 * intentionally doesn't add a new Postgres table on top of that; see the
 * sync script's own header comment for the migration path once it does.
 *
 * A 0-1 model rating, not a percentile and not directly comparable to
 * any other provider's score — shown as Impect's own scale, not
 * translated into anything else.
 */
export function ImpectSquadRatingsWidget() {
  const { competitionName, season, asOfDate, ratings } = ratingsData;

  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-4">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Squad Strength Ratings — Impect
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            {competitionName} {season} · as of {formatDate(asOfDate)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto pt-2">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Club</th>
              <th style={{ width: 100 }}>Rating</th>
            </tr>
          </thead>
          <tbody>
            {ratings.map((r) => {
              const isKvm = r.squadName === "KV Mechelen";
              return (
                <tr key={r.squadId} className={cn(isKvm && "bg-kvm-red/5")}>
                  <td className="tabular-nums text-gray-400">{r.rank}</td>
                  <td className={cn("font-medium", isKvm ? "text-kvm-red" : "text-kvm-ink")}>{r.squadName}</td>
                  <td className="tabular-nums text-gray-600">{r.rating.toFixed(4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-kvm-border px-5 py-2 text-[11px] text-gray-400">
        Impect&apos;s own model rating (0&ndash;1 scale) — not a percentile, not directly comparable to any other
        provider&apos;s score. Snapshot, not live-refreshing.
      </p>
    </div>
  );
}
