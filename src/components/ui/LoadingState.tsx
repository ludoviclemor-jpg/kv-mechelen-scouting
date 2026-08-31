import { Loader2 } from "lucide-react";

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

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-sm font-medium text-kvm-red">Couldn&apos;t load data</p>
      <p className="max-w-sm text-xs text-gray-400">{message}</p>
    </div>
  );
}
