"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { DateNav } from "@/components/matches/DateNav";
import { MatchList, groupMatches } from "@/components/matches/MatchList";
import { FilterBar, FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { fetchMatchesByDate, type MatchSummary } from "@/lib/matches-data";
import { useAsync } from "@/lib/players-data";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function uniqueSorted(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => v !== null))).sort((a, b) => a.localeCompare(b));
}

const KICKOFF_BANDS = [
  { value: "all", label: "Any time" },
  { value: "morning", label: "Morning (before 12:00)" },
  { value: "afternoon", label: "Afternoon (12:00–18:00)" },
  { value: "evening", label: "Evening (after 18:00)" },
];

function matchesKickoffBand(m: MatchSummary, band: string): boolean {
  if (band === "all") return true;
  if (!m.date) return false;
  const hour = new Date(m.date).getUTCHours();
  if (band === "morning") return hour < 12;
  if (band === "afternoon") return hour >= 12 && hour < 18;
  return hour >= 18;
}

const STATUS_LABELS: Record<string, string> = { played: "Played", open: "Scheduled" };

export default function ExplorePage() {
  const [date, setDate] = useState(todayISO);
  const [country, setCountry] = useState("all");
  const [competitionId, setCompetitionId] = useState("all");
  const [status, setStatus] = useState("all");
  const [clubSearch, setClubSearch] = useState("");
  const [kickoffBand, setKickoffBand] = useState("all");

  const { data: matches, loading, error } = useAsync(() => fetchMatchesByDate(date), [date]);

  const countries = useMemo(() => uniqueSorted((matches ?? []).map((m) => m.competitionArea)), [matches]);
  const competitionsInCountry = useMemo(() => {
    const pool = country === "all" ? matches ?? [] : (matches ?? []).filter((m) => m.competitionArea === country);
    const seen = new Map<string, string>();
    for (const m of pool) {
      if (m.competitionId && !seen.has(m.competitionId)) seen.set(m.competitionId, m.competitionName ?? m.competitionId);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [matches, country]);
  const statuses = useMemo(() => uniqueSorted((matches ?? []).map((m) => m.status)), [matches]);

  const filtered = useMemo(() => {
    const club = clubSearch.trim().toLowerCase();
    return (matches ?? []).filter((m) => {
      if (country !== "all" && m.competitionArea !== country) return false;
      if (competitionId !== "all" && m.competitionId !== competitionId) return false;
      if (status !== "all" && m.status !== status) return false;
      if (!matchesKickoffBand(m, kickoffBand)) return false;
      if (club) {
        const haystack = `${m.homeTeamName ?? ""} ${m.awayTeamName ?? ""}`.toLowerCase();
        if (!haystack.includes(club)) return false;
      }
      return true;
    });
  }, [matches, country, competitionId, status, kickoffBand, clubSearch]);

  const groups = useMemo(() => groupMatches(filtered), [filtered]);

  function handleCountryChange(value: string) {
    setCountry(value);
    setCompetitionId("all");
  }

  const chips: ActiveFilterChip[] = [];
  if (country !== "all") chips.push({ key: "country", label: "Country", value: country, onClear: () => handleCountryChange("all") });
  if (competitionId !== "all")
    chips.push({
      key: "competition",
      label: "Competition",
      value: competitionsInCountry.find((c) => c.id === competitionId)?.name ?? competitionId,
      onClear: () => setCompetitionId("all"),
    });
  if (status !== "all") chips.push({ key: "status", label: "Status", value: STATUS_LABELS[status] ?? status, onClear: () => setStatus("all") });
  if (kickoffBand !== "all") chips.push({ key: "kickoff", label: "Kick-off", value: KICKOFF_BANDS.find((b) => b.value === kickoffBand)!.label, onClear: () => setKickoffBand("all") });
  if (clubSearch.trim()) chips.push({ key: "club", label: "Club", value: clubSearch.trim(), onClear: () => setClubSearch("") });

  function clearAll() {
    setCountry("all");
    setCompetitionId("all");
    setStatus("all");
    setKickoffBand("all");
    setClubSearch("");
  }

  return (
    <>
      <PageHeader
        title="Explore"
        description={matches ? `${filtered.length} of ${matches.length} matches` : "Browse matches by day — country → competition → match."}
      />

      <DateNav date={date} onChange={setDate} />

      <div className="flex items-center justify-between gap-4 border-b border-kvm-border bg-white px-8 py-3">
        <SearchBar value={clubSearch} onChange={setClubSearch} placeholder="Search club..." />
      </div>

      <FilterBar>
        <FilterSelect
          label="Country"
          value={country}
          onChange={handleCountryChange}
          options={[{ value: "all", label: "All countries" }, ...countries.map((c) => ({ value: c, label: c }))]}
        />
        <FilterSelect
          label="Competition"
          value={competitionId}
          onChange={setCompetitionId}
          disabled={country === "all"}
          options={[
            { value: "all", label: country === "all" ? "Pick a country first" : "All competitions" },
            ...competitionsInCountry.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[{ value: "all", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))]}
        />
        <FilterSelect label="Kick-off" value={kickoffBand} onChange={setKickoffBand} options={KICKOFF_BANDS} />
      </FilterBar>

      <ActiveFilterChips chips={chips} onClearAll={clearAll} />

      <div className="p-8">
        {error ? (
          <div className="border border-kvm-border bg-white">
            <ErrorState message={error.message} />
          </div>
        ) : loading ? (
          <div className="border border-kvm-border bg-white">
            <LoadingState label="Loading matches…" />
          </div>
        ) : groups.length === 0 ? (
          <div className="border border-kvm-border bg-white">
            <EmptyState
              icon={CalendarDays}
              title="No matches match these filters"
              description="Try a different date, or clear a filter."
            />
          </div>
        ) : (
          <MatchList groups={groups} />
        )}
      </div>
    </>
  );
}
