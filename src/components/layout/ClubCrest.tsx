import { cn } from "@/lib/utils";

/**
 * Renders the official KV Mechelen crest from `/public/branding/crest.svg`
 * once it's added. Until then, falls back to a monogram badge so layout
 * and branding work end-to-end without an unofficial logo asset.
 *
 * To go live: drop the official crest at `public/branding/crest.svg` and
 * set `CREST_AVAILABLE` to true.
 */
const CREST_AVAILABLE = false;

export function ClubCrest({ className }: { className?: string }) {
  if (CREST_AVAILABLE) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export has no Image Optimization server
      <img
        src="/branding/crest.svg"
        alt="KV Mechelen crest"
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-sm bg-kvm-yellow text-kvm-ink font-black tracking-tight",
        className
      )}
      role="img"
      aria-label="KV Mechelen crest placeholder"
    >
      KVM
    </div>
  );
}
