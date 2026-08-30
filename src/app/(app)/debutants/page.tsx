"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect } from "@/components/ui/FilterBar";
import { DebutantTable } from "@/components/players/DebutantTable";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getAfricanDebutants,
  POSITIONS,
  POSITION_LABELS,
} from "@/lib/players-data";
import { calculateAge } from "@/lib/utils";
import { Globe2 } from "lucide-react";

const ALL_DEBUTANTS = getAfricanDebutants();

const AGE_BANDS = [
  { value: "all", label: "All ages" },
  { value: "u20", label: "Under 20" },
  { value: "20-22", label: "20 – 22" },
  { value: "23+", label: "23+" },
];

function matchesAgeBand(age: number | null, band: string) {
  if (band === "all") return true;
  if (age === null) return false; // unknown age never matches a specific band
  switch (band) {
    case "u20":
      return age < 20;
    case "20-22":
      return age >= 20 && age <= 22;
    case "23+":
      return age >= 23;
    default:
      return true;
  }
}

function uniqueSorted(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => v !== null))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export default function DebutantsPage() {
  const [country, setCountry] = useState("all");
  const [league, setLeague] = useState("all");
  const [position, setPosition] = useState("all");
  const [ageBand, setAgeBand] = useState("all");
  const [sortByDebutDate, setSortByDebutDate] = useState<"newest" | "oldest">(
    "newest"
  );

  const countries = useMemo(
    () => uniqueSorted(ALL_DEBUTANTS.map((p) => p.nationality)),
    []
  );
  const leagues = useMemo(
    () => uniqueSorted(ALL_DEBUTANTS.map((p) => p.league)),
    []
  );

  const filtered = useMemo(() => {
    return ALL_DEBUTANTS.filter((p) => {
      if (country !== "all" && p.nationality !== country) return false;
      if (league !== "all" && p.league !== league) return false;
      if (position !== "all" && p.position !== position) return false;
      if (!matchesAgeBand(calculateAge(p.dateOfBirth), ageBand)) return false;
      return true;
    }).sort((a, b) => {
      const cmp = (a.debutDate ?? "").localeCompare(b.debutDate ?? "");
      return sortByDebutDate === "newest" ? -cmp : cmp;
    });
  }, [country, league, position, ageBand, sortByDebutDate]);

  return (
    <>
      <PageHeader
        title="African Debutants"
        description="Senior first-team debuts by African players across Eastern European leagues (youth &amp; reserve teams excluded)."
      />

      <FilterBar>
        <FilterSelect
          label="Country"
          value={country}
          onChange={setCountry}
          options={[{ value: "all", label: "All countries" }, ...countries.map((c) => ({ value: c, label: c }))]}
        />
        <FilterSelect
          label="League"
          value={league}
          onChange={setLeague}
          options={[{ value: "all", label: "All leagues" }, ...leagues.map((l) => ({ value: l, label: l }))]}
        />
        <FilterSelect
          label="Position"
          value={position}
          onChange={setPosition}
          options={[
            { value: "all", label: "All positions" },
            ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] })),
          ]}
        />
        <FilterSelect label="Age" value={ageBand} onChange={setAgeBand} options={AGE_BANDS} />
        <FilterSelect
          label="Debut date"
          value={sortByDebutDate}
          onChange={(v) => setSortByDebutDate(v as "newest" | "oldest")}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
          ]}
        />
      </FilterBar>

      <div className="mx-8 my-6 border border-kvm-border bg-white">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Globe2}
            title="No debutants match these filters"
            description="Adjust the filters above, or check back after the next sync."
          />
        ) : (
          <DebutantTable players={filtered} />
        )}
      </div>
    </>
  );
}
