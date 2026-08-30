import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <Icon size={28} className="text-gray-300" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {description ? (
        <p className="max-w-xs text-xs text-gray-400">{description}</p>
      ) : null}
    </div>
  );
}
