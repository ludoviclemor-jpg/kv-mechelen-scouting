import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SectionHeader({
  title,
  viewAllHref,
}: {
  title: string;
  viewAllHref?: string;
}) {
  return (
    <div className="flex items-center justify-between px-5 pt-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
        {title}
      </h2>
      {viewAllHref ? (
        <Link
          href={viewAllHref}
          className="flex items-center gap-1 text-xs font-semibold text-kvm-red hover:underline"
        >
          View all
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
