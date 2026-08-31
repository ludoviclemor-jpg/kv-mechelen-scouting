"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  Users,
  Trophy,
  Globe2,
  TrendingUp,
  ListChecks,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";
import { ClubCrest } from "./ClubCrest";
import { cn, formatDate } from "@/lib/utils";
import { fetchSyncMeta, useAsync } from "@/lib/players-data";
import { useAuth } from "@/lib/auth/AuthProvider";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/players", label: "Players", icon: Users },
  { href: "/competitions", label: "Competitions", icon: Trophy },
  { href: "/debutants", label: "African Debutants", icon: Globe2 },
  { href: "/top-performers", label: "Top Performers", icon: TrendingUp },
  { href: "/shortlists", label: "Shortlists", icon: ListChecks },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function syncState(status: string | undefined): "ok" | "warning" | "error" {
  if (status === "success") return "ok";
  if (status === "partial") return "warning";
  return "error"; // "failed" or "never_run"
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { data: syncMeta } = useAsync(() => fetchSyncMeta(), []);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

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

      <div className="border-t border-kvm-border-dark px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Signed in
            </div>
            <div className="truncate text-xs text-gray-200" title={user?.email ?? undefined}>
              {user?.email ?? "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex shrink-0 items-center gap-1 rounded-sm px-2 py-1.5 text-xs font-medium text-gray-300 hover:bg-kvm-charcoal-light hover:text-white"
          >
            <LogOut size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="border-t border-kvm-border-dark px-5 py-4 text-xs text-gray-400">
        <div className="mb-1.5 font-semibold uppercase tracking-wide text-gray-500">
          Last sync:
        </div>
        <div className="flex items-center gap-2 text-gray-200">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              syncState(syncMeta?.lastSyncStatus) === "ok" && "bg-green-500",
              syncState(syncMeta?.lastSyncStatus) === "warning" && "bg-kvm-yellow",
              syncState(syncMeta?.lastSyncStatus) === "error" && "bg-kvm-red"
            )}
            aria-hidden="true"
          />
          {syncMeta?.lastSyncedAt ? formatDate(syncMeta.lastSyncedAt.slice(0, 10)) : "Never synced"}
        </div>
        <div className="mt-1 text-[11px] text-gray-500">
          {syncMeta?.activePlayersCount ?? "—"} players · source: SCOUTASTIC
        </div>
      </div>
    </aside>
  );
}
