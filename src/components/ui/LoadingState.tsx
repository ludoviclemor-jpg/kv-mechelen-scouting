import { Loader2, RotateCw } from "lucide-react";

/**
 * Shared loading placeholder for every page that now fetches from Postgres
 * at runtime (see src/lib/players-data/remote.ts) instead of reading a
 * build-time static file — there's a real network round trip on every
 * page load now, so every one of those pages needs a real loading state.
 */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <Loader2 size={22} className="animate-spin text-gray-300" aria-hidden="true" />
      <p className="text-sm font-medium text-gray-500">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-sm font-medium text-kvm-red">Couldn&apos;t load data</p>
      <p className="max-w-sm text-xs text-gray-400">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 flex items-center gap-1.5 rounded-md border border-kvm-border px-3 py-1.5 text-xs font-semibold text-kvm-ink hover:bg-gray-50"
        >
          <RotateCw size={12} aria-hidden="true" />
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * Fixed-height skeleton rows — used in place of `LoadingState` where a
 * widget needs to hold its final layout size while loading, so the rest of
 * a dashboard-style grid doesn't jump around as each independent widget
 * resolves at its own pace (see docs on "independent widget loading").
 * `rows`/`rowHeight` should roughly match the real content's shape.
 */
export function SkeletonBlock({ rows = 3, rowHeight = 20 }: { rows?: number; rowHeight?: number }) {
  return (
    <div className="animate-pulse space-y-2 px-5 py-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded bg-gray-100" style={{ height: rowHeight }} />
      ))}
    </div>
  );
}
