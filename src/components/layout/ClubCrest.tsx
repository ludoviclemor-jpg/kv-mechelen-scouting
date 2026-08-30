import { cn } from "@/lib/utils";

/**
 * Renders the official KV Mechelen crest from `/public/branding/crest.png`.
 * Falls back to a monogram badge if the asset is ever removed, so layout
 * never silently breaks without an unofficial logo asset in its place.
 */
const CREST_AVAILABLE = true;

export function ClubCrest({ className }: { className?: string }) {
  if (CREST_AVAILABLE) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export has no Image Optimization server
      <img
        src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/branding/crest.png`}
        alt="KV Mechelen crest"
        className={cn("object-contain", className)}
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
