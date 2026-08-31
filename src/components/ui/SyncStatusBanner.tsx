import Link from "next/link";
import { CircleAlert, AlertTriangle } from "lucide-react";
import { fetchSyncMeta, useAsync } from "@/lib/players-data";
import { formatDate } from "@/lib/utils";

/**
 * Surfaces the real SCOUTASTIC sync state — the closest thing to a "live
 * backend unavailable" error this static-export architecture has, since
 * player data is synced by GitHub Actions rather than fetched at runtime.
 * Renders nothing once a sync has succeeded cleanly (or while still loading —
 * this banner is a secondary signal, not worth its own loading state).
 */
export function SyncStatusBanner() {
  const { data: meta } = useAsync(() => fetchSyncMeta(), []);
  if (!meta) return null;

  if (meta.lastSyncStatus === "never_run") {
    return (
      <div className="flex items-center gap-2 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <CircleAlert size={16} className="shrink-0" aria-hidden="true" />
        <span>
          No SCOUTASTIC sync has run yet — the player database is empty. See{" "}
          <Link href="/settings" className="font-semibold underline">
            Settings
          </Link>{" "}
          for how to trigger one.
        </span>
      </div>
    );
  }

  if (meta.lastSyncStatus === "failed" || meta.lastSyncStatus === "partial") {
    return (
      <div className="flex items-center gap-2 border border-kvm-red bg-red-50 px-4 py-3 text-sm text-red-800">
        <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
        <span>
          {meta.lastSyncStatus === "failed" ? "The last SCOUTASTIC sync failed" : "The last SCOUTASTIC sync only partially completed"}
          {meta.lastSyncedAt ? ` (${formatDate(meta.lastSyncedAt.slice(0, 10))})` : ""} — showing the last known-good
          data. See{" "}
          <Link href="/settings" className="font-semibold underline">
            Settings
          </Link>{" "}
          for details.
        </span>
      </div>
    );
  }

  return null;
}
