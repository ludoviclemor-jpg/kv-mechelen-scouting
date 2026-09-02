"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  Users,
  Trophy,
  Globe2,
  TrendingUp,
  ArrowRightLeft,
  ListChecks,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ClubCrest } from "./ClubCrest";
import { GlobalSearch } from "./GlobalSearch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/players", label: "Players", icon: Users },
  { href: "/competitions", label: "Competitions", icon: Trophy },
  { href: "/debutants", label: "African Debutants", icon: Globe2 },
  { href: "/top-performers", label: "Top Performers", icon: TrendingUp },
  { href: "/loan-watch", label: "Loan Watch", icon: ArrowRightLeft },
  { href: "/shortlists", label: "Shortlists", icon: ListChecks },
  { href: "/reports", label: "Reports", icon: FileText },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
  compact = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center whitespace-nowrap border-b-2 font-medium transition-colors",
        compact ? "gap-2 rounded-sm px-2.5 py-2 text-sm" : "gap-1.5 px-2.5 py-1.5 text-[13px]",
        active
          ? "border-kvm-red text-white"
          : "border-transparent text-gray-300 hover:bg-kvm-charcoal-light hover:text-white"
      )}
    >
      <Icon size={compact ? 16 : 15} strokeWidth={2} aria-hidden="true" />
      {label}
    </Link>
  );
}

/**
 * Full nav + search only render at `xl` — eight labeled items plus a
 * search box plus account controls genuinely doesn't fit a `lg` (1024px)
 * viewport without cramping or wrapping. Below `xl`, everything (nav,
 * search, settings, account) lives in the slide-out drawer instead —
 * simpler than trying to partially collapse the bar at an intermediate
 * width.
 */
export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    setMobileOpen(false);
    await signOut();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-kvm-border-dark bg-kvm-charcoal text-white">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <ClubCrest className="h-8 w-8 text-sm" />
          <div className="hidden leading-tight sm:block">
            <div className="text-xs font-bold tracking-wide">KV MECHELEN</div>
            <div className="text-[9px] font-medium tracking-widest text-kvm-red">SCOUTING HUB</div>
          </div>
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-0.5 xl:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden w-64 xl:block">
            <GlobalSearch />
          </div>

          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className={cn(
              "hidden rounded-sm p-2 xl:block",
              isActive(pathname, "/settings")
                ? "bg-kvm-red text-white"
                : "text-gray-300 hover:bg-kvm-charcoal-light hover:text-white"
            )}
          >
            <Settings size={17} aria-hidden="true" />
          </Link>

          <div className="hidden items-center gap-2 border-l border-kvm-border-dark pl-2 xl:flex">
            <span className="max-w-[10rem] truncate text-xs text-gray-300" title={user?.email ?? undefined}>
              {user?.email ?? "—"}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-sm p-2 text-gray-300 hover:bg-kvm-charcoal-light hover:text-white"
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded-sm p-2 text-gray-300 hover:bg-kvm-charcoal-light hover:text-white xl:hidden"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-kvm-charcoal text-white shadow-xl">
            <div className="flex items-center justify-between border-b border-kvm-border-dark px-4 py-3">
              <span className="text-sm font-bold tracking-wide">Menu</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="text-gray-300 hover:text-white"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="border-b border-kvm-border-dark p-3">
              <GlobalSearch />
            </div>

            <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  {...item}
                  active={isActive(pathname, item.href)}
                  onClick={() => setMobileOpen(false)}
                  compact
                />
              ))}
              <NavLink
                href="/settings"
                label="Settings"
                icon={Settings}
                active={isActive(pathname, "/settings")}
                onClick={() => setMobileOpen(false)}
                compact
              />
            </nav>

            <div className="border-t border-kvm-border-dark p-3">
              <div className="mb-2 truncate px-1 text-xs text-gray-400" title={user?.email ?? undefined}>
                {user?.email ?? "—"}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-sm font-medium text-gray-300 hover:bg-kvm-charcoal-light hover:text-white"
              >
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
