import { cn } from "@/lib/utils";

function ratingTone(rating: number) {
  if (rating >= 7.5) return "bg-emerald-600 text-white";
  if (rating >= 6.5) return "bg-kvm-yellow text-kvm-ink";
  return "bg-gray-300 text-kvm-ink";
}

export function RatingBadge({
  rating,
  size = "md",
}: {
  rating: number | null;
  size?: "sm" | "md";
}) {
  if (rating === null) {
    return (
      <span className="inline-flex items-center rounded-sm bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-400">
        N/A
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-bold tabular-nums",
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
        ratingTone(rating)
      )}
    >
      {rating.toFixed(2)}
    </span>
  );
}

export function StarRating({ rating }: { rating: number | null }) {
  const stars = rating === null ? 0 : Math.max(0, Math.min(5, Math.round(rating / 2)));
  return (
    <span
      className="text-kvm-yellow-dark tracking-tight"
      aria-label={`${stars} out of 5 stars`}
    >
      {"★".repeat(stars)}
      <span className="text-gray-300">{"★".repeat(5 - stars)}</span>
    </span>
  );
}
