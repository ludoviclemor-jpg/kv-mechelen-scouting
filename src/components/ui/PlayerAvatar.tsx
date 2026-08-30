import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const PALETTE = [
  "bg-slate-600",
  "bg-blue-700",
  "bg-emerald-700",
  "bg-purple-700",
  "bg-amber-700",
  "bg-rose-700",
  "bg-teal-700",
];

function paletteIndex(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % PALETTE.length;
  return hash;
}

/**
 * DEMO player photos are not available — this renders an initials avatar.
 * Swap in a real `photoUrl` (SCOUTASTIC/SofaScore imagery) and this
 * component will render it directly with the same size classes.
 */
export function PlayerAvatar({
  name,
  photoUrl,
  size = "md",
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-xs",
    lg: "h-16 w-16 text-lg",
  }[size];

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export has no Image Optimization server
      <img
        src={photoUrl}
        alt={name}
        className={cn("shrink-0 rounded-full object-cover", sizeClasses, className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizeClasses,
        PALETTE[paletteIndex(name)],
        className
      )}
      role="img"
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}
