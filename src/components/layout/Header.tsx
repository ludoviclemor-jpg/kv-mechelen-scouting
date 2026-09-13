"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  ListTodo,
  FileText,
  FileClock,
  HeartPulse,
  LineChart,
  Flag,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ClubCrest } from "./ClubCrest";
import { GlobalSearch } from "./GlobalSearch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";

interface NavLeaf {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
}

type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

/**
 * Simplified from a flat 12-item bar (docs redesign brief, 2026-09-07) into
 * four top-level entries — Dashboard stays a direct link, the rest group
 * every existing destination under "Discover" / "Monitor" / "My Scouting"
 * so the bar reads at a glance and fits comfortably at laptop widths. Every
 * previous URL is unchanged — this only regroups navigation, nothing moved.
 */
const NAV_ENTRIES: NavEntry[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "Discover",
    icon: Compass,
    items: [
      { href: "/explore", label: "Explore", icon: Compass },
      { href: "/players", label: "Players", icon: Users },
      { href: "/competitions", label: "Competitions", icon: Trophy },
    ],
  },
  {
    label: "Monitor",
    icon: LineChart,
    items: [
      { href: "/debutants", label: "African Debutants", icon: Globe2 },
      { href: "/call-ups", label: "First Call-Ups", icon: Flag },
      { href: "/top-performers", label: "Top Performers", icon: TrendingUp },
      { href: "/loan-watch", label: "Loan Watch", icon: ArrowRightLeft },
      { href: "/contract-watch", label: "Contract Watch", icon: FileClock },
      { href: "/injuries", label: "Injury Tracker", icon: HeartPulse },
      { href: "/market-movers", label: "Market Movers", icon: LineChart },
    ],
  },
  {
    label: "My Scouting",
    icon: ListChecks,
    items: [
      { href: "/shortlists", label: "Shortlists", icon: ListChecks },
      { href: "/reports", label: "Reports", icon: FileText },
      { href: "/todos", label: "My To-Dos", icon: ListTodo },
    ],
  },
];

function isActiveHref(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupIsActive(pathname: string, group: NavGroup) {
  return group.items.some((item) => isActiveHref(pathname, item.href));
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
  compact = false,
}: NavLeaf & { active: boolean; onClick?: () => void; compact?: boolean }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center whitespace-nowrap border-b-2 font-medium transition-colors",
        compact ? "gap-2 rounded-md px-2.5 py-2 text-sm" : "gap-1.5 px-2.5 py-1.5 text-[13px]",
        active
          ? "border-kvm-yellow text-kvm-yellow"
          : "border-transparent text-gray-300 hover:bg-kvm-charcoal-light hover:text-white"
      )}
    >
      <Icon size={compact ? 16 : 15} strokeWidth={2} aria-hidden="true" />
      {label}
    </Link>
  );
}

/** Desktop group trigger + dropdown menu. Keyboard: Enter/Space toggles, Escape closes and returns focus to the trigger, click-outside closes. */
function NavGroupDropdown({ group, active }: { group: NavGroup; active: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const Icon = group.icon;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-1.5 text-[13px] font-medium transition-colors",
          active || open
            ? "border-kvm-yellow text-kvm-yellow"
            : "border-transparent text-gray-300 hover:bg-kvm-charcoal-light hover:text-white"
        )}
      >
        <Icon size={15} strokeWidth={2} aria-hidden="true" />
        {group.label}
        <ChevronDown size={13} aria-hidden="true" className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div role="menu" aria-label={group.label} className="absolute left-0 z-50 mt-1 w-56 rounded-md border border-kvm-border-dark bg-kvm-charcoal py-1.5 shadow-xl">
          {group.items.map((item) => {
            const itemActive = isActiveHref(pathname, item.href);
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                aria-current={itemActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium",
                  itemActive ? "bg-kvm-charcoal-light text-kvm-yellow" : "text-gray-200 hover:bg-kvm-charcoal-light hover:text-white"
                )}
              >
                <ItemIcon size={15} strokeWidth={2} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Full nav + search render at `lg` (1024px) — down from the previous `xl`
 * (1280px) threshold, now that the bar only holds four labeled entries
 * instead of eight, comfortably avoiding horizontal overflow on laptop
 * widths. Below `lg`, nav/search/settings/account all live in the
 * slide-out drawer.
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

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 lg:flex">
          {NAV_ENTRIES.map((entry) =>
            isGroup(entry) ? (
              <NavGroupDropdown key={entry.label} group={entry} active={groupIsActive(pathname, entry)} />
            ) : (
              <NavLink key={entry.href} {...entry} active={isActiveHref(pathname, entry.href)} />
            )
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Was `hidden ... lg:block` (1024px) — invisible on many real
              laptop windows even though the nav itself only collapses to
              the hamburger at the same breakpoint. `sm` (640px) keeps the
              search reachable on any non-phone width; true phones still
              get it inside the hamburger menu below. */}
          <div className="hidden w-56 sm:block md:w-64">
            <GlobalSearch />
          </div>

          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className={cn(
              "hidden rounded-md p-2 lg:block",
              isActiveHref(pathname, "/settings")
                ? "bg-kvm-yellow text-kvm-ink"
                : "text-gray-300 hover:bg-kvm-charcoal-light hover:text-white"
            )}
          >
            <Settings size={17} aria-hidden="true" />
          </Link>

          <div className="hidden items-center gap-2 border-l border-kvm-border-dark pl-2 lg:flex">
            <span className="max-w-[10rem] truncate text-xs text-gray-300" title={user?.email ?? undefined}>
              {user?.email ?? "—"}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-md p-2 text-gray-300 hover:bg-kvm-charcoal-light hover:text-white"
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-2 text-gray-300 hover:bg-kvm-charcoal-light hover:text-white lg:hidden"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
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

            <nav aria-label="Primary" className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
              {NAV_ENTRIES.map((entry) =>
                isGroup(entry) ? (
                  <div key={entry.label}>
                    <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">{entry.label}</div>
                    <div className="flex flex-col gap-1">
                      {entry.items.map((item) => (
                        <NavLink
                          key={item.href}
                          {...item}
                          active={isActiveHref(pathname, item.href)}
                          onClick={() => setMobileOpen(false)}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <NavLink
                    key={entry.href}
                    {...entry}
                    active={isActiveHref(pathname, entry.href)}
                    onClick={() => setMobileOpen(false)}
                    compact
                  />
                )
              )}
              <NavLink
                href="/settings"
                label="Settings"
                icon={Settings}
                active={isActiveHref(pathname, "/settings")}
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
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-gray-300 hover:bg-kvm-charcoal-light hover:text-white"
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
