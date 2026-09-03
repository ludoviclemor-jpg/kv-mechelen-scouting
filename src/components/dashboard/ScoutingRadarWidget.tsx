"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Player, InjuredPlayer, MarketValueMover } from "@/lib/players-data";
import { PriorityPlayersList } from "@/components/players/PriorityPlayersList";
import { LoanWatchList } from "@/components/players/LoanWatchList";
import { ContractWatchList } from "@/components/players/ContractWatchList";
import { InjuryTrackerList } from "@/components/players/InjuryTrackerList";
import { MarketMoversList } from "@/components/players/MarketMoversList";
import { cn } from "@/lib/utils";

/**
 * Consolidates five previously-separate homepage widgets (Priority
 * Players, Loan Watch, Contract Watch, Injury Tracker, Market Movers)
 * into one tabbed card — same real data each list already had, just a
 * different information architecture: five stacked cards each demanding
 * their own scroll real estate vs. one card a scout switches between.
 * Every underlying fetch stays exactly as it was (still fetched once on
 * the homepage, passed down as props) — this component is purely
 * presentational.
 */
const TABS = [
  { key: "priority", label: "Priority", href: "/shortlists" },
  { key: "loan", label: "Loan Watch", href: "/loan-watch" },
  { key: "contract", label: "Contract Watch", href: "/contract-watch" },
  { key: "injuries", label: "Injuries", href: "/injuries" },
  { key: "movers", label: "Market Movers", href: "/market-movers" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ScoutingRadarWidget({
  priorityPlayers,
  loanWatch,
  contractWatch,
  injuries,
  marketMovers,
}: {
  priorityPlayers: Player[];
  loanWatch: Player[];
  contractWatch: Player[];
  injuries: InjuredPlayer[];
  marketMovers: MarketValueMover[];
}) {
  const [tab, setTab] = useState<TabKey>("priority");
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <section className="border border-kvm-border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-kvm-border px-5 pt-4">
        <div role="tablist" aria-label="Scouting Radar" className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "whitespace-nowrap border-b-2 px-2.5 pb-2.5 text-xs font-bold uppercase tracking-wide transition-colors",
                tab === t.key ? "border-kvm-red text-kvm-ink" : "border-transparent text-gray-400 hover:text-kvm-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Link href={active.href} className="mb-2.5 flex shrink-0 items-center gap-1 text-xs font-semibold text-kvm-red hover:underline">
          View all
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      </div>

      {tab === "priority" ? <PriorityPlayersList players={priorityPlayers} /> : null}
      {tab === "loan" ? <LoanWatchList players={loanWatch} /> : null}
      {tab === "contract" ? <ContractWatchList players={contractWatch} /> : null}
      {tab === "injuries" ? <InjuryTrackerList injured={injuries} /> : null}
      {tab === "movers" ? <MarketMoversList movers={marketMovers} /> : null}
    </section>
  );
}
