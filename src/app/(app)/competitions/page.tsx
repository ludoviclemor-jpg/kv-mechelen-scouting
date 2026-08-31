"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trophy, Globe2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import {
  fetchCompetitions,
  fetchCompetitionCountries,
  type Competition,
} from "@/lib/competitions-data";
import { useAsync } from "@/lib/players-data";

/** 300ms — matches the Players/Shortlists page search debounce. */
function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function groupByCountry(competitions: Competition[]): [string, Competition[]][] {
  const groups = new Map<string, Competition[]>();
  for (const c of competitions) {
    const key = c.area ?? "Unknown";
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export default function CompetitionsPage() {
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("all");
  const [levelDefinition, setLevelDefinition] = useState("all");
  const [activeOnly, setActiveOnly] = useState(true);

  const debouncedSearch = useDebounced(search);

  const countries = useAsync(() => fetchCompetitionCountries(), []);
  const result = useAsync(
    () => fetchCompetitions({ search: debouncedSearch, area, levelDefinition, activeOnly, europeanOnly: true }),
    [debouncedSearch, area, levelDefinition, activeOnly]
  );

  const levelDefinitions = useMemo(() => {
    const values = new Set((result.data ?? []).map((c) => c.levelDefinition).filter((v): v is string => v !== null));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [result.data]);

  const grouped = useMemo(() => groupByCountry(result.data ?? []), [result.data]);

  const chips: ActiveFilterChip[] = [];
  if (area !== "all") chips.push({ key: "area", label: "Country", value: area, onClear: () => setArea("all") });
  if (levelDefinition !== "all") chips.push({ key: "level", label: "Type", value: levelDefinition, onClear: () => setLevelDefinition("all") });
  if (!activeOnly) chips.push({ key: "active", label: "Status", value: "Include inactive", onClear: () => setActiveOnly(true) });
  function clearAll() {
    setArea("all");
    setLevelDefinition("all");
    setActiveOnly(true);
  }

  return (
    <>
      <PageHeader
        title="European Competitions"
        description={result.data ? `${result.data.length} competitions across ${grouped.length} countries — sourced from SCOUTASTIC` : undefined}
      />

      <div className="flex items-center justify-between gap-4 border-b border-kvm-border bg-white px-8 py-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search competition or country..." />
      </div>

      <FilterBar activeCount={chips.length}>
        <FilterSelect
          label="Country"
          value={area}
          onChange={setArea}
          options={[{ value: "all", label: "All countries" }, ...(countries.data ?? []).map((c) => ({ value: c, label: c }))]}
        />
        <FilterSelect
          label="Type / Tier"
          value={levelDefinition}
          onChange={setLevelDefinition}
          options={[{ value: "all", label: "All types" }, ...levelDefinitions.map((l) => ({ value: l, label: l }))]}
        />
        <FilterSelect
          label="Status"
          value={activeOnly ? "active" : "all"}
          onChange={(v) => setActiveOnly(v === "active")}
          options={[
            { value: "active", label: "Active only" },
            { value: "all", label: "Include inactive" },
          ]}
        />
      </FilterBar>

      <ActiveFilterChips chips={chips} onClearAll={clearAll} />

      <div className="p-8">
        {result.error ? (
          <div className="border border-kvm-border bg-white">
            <ErrorState message={result.error.message} />
          </div>
        ) : result.loading ? (
          <div className="border border-kvm-border bg-white">
            <LoadingState label="Loading competitions…" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="border border-kvm-border bg-white">
            <EmptyState
              icon={Globe2}
              title="No competitions match these filters"
              description="Try widening your search or clearing a filter."
            />
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([country, competitions]) => (
              <section key={country} className="border border-kvm-border bg-white">
                <h2 className="border-b border-kvm-border bg-gray-50 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                  {country}
                </h2>
                <ul className="divide-y divide-kvm-border">
                  {competitions.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/competition?id=${c.id}`}
                        className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-gray-100 text-gray-400">
                            <Trophy size={15} aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-kvm-ink">{c.name ?? "Unnamed competition"}</div>
                            <div className="text-xs text-gray-400">
                              {c.levelDefinition ?? "Unknown tier"}
                              {c.teamCount > 0 ? ` · ${c.teamCount} teams` : ""}
                            </div>
                          </div>
                        </div>
                        {!c.isActive ? (
                          <span className="shrink-0 rounded-sm bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                            Inactive
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
