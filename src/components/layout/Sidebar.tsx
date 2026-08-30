"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Globe2,
  TrendingUp,
  ListChecks,
  FileText,
  Settings,
} from "lucide-react";
import { ClubCrest } from "./ClubCrest";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/players", label: "Players", icon: Users },
  { href: "/debutants", label: "African Debutants", icon: Globe2 },
  { href: "/top-performers", label: "Top Performers", icon: TrendingUp },
  { href: "/shortlists", label: "Shortlists", icon: ListChecks },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * DEMO — sync metadata will come from the Phase 5 daily-sync service.
 */
const DEMO_SYNC_STATUS = {
  lastSync: "30 Aug 2026, 06:00",
  state: "ok" as "ok" | "warning" | "error",
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-kvm-border-dark bg-kvm-charcoal text-white">
      <div className="flex items-center gap-3 border-b border-kvm-border-dark px-5 py-5">
        <ClubCrest className="h-10 w-10 text-base shrink-0" />
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-wide">KV MECHELEN</div>
          <div className="text-[11px] font-medium tracking-widest text-kvm-yellow">
            SCOUTING HUB
          </div>
        </div>
      </div>

      <nav
        aria-label="Primary"
        className="flex-1 overflow-y-auto px-3 py-4"
      >
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-kvm-yellow text-kvm-ink"
                      : "text-gray-300 hover:bg-kvm-charcoal-light hover:text-white"
                  )}
                >
                  <Icon size={17} strokeWidth={2} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-kvm-border-dark px-5 py-4 text-xs text-gray-400">
        <div className="mb-1.5 font-semibold uppercase tracking-wide text-gray-500">
          Last sync:
        </div>
        <div className="flex items-center gap-2 text-gray-200">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              DEMO_SYNC_STATUS.state === "ok" && "bg-green-500",
              DEMO_SYNC_STATUS.state === "warning" && "bg-kvm-yellow",
              DEMO_SYNC_STATUS.state === "error" && "bg-kvm-red"
            )}
            aria-hidden="true"
          />
          {DEMO_SYNC_STATUS.lastSync}
        </div>
        <div className="mt-1 text-[11px] text-gray-500">
          Automatic sync not yet connected
        </div>
      </div>
    </aside>
  );
}
