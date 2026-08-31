"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, User, Building2, Trophy, Globe2 } from "lucide-react";
import { globalSearch } from "@/lib/search";
import { useAsync } from "@/lib/players-data";

/** 300ms — matches every other debounced search in the app. */
function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Top-of-app search — one box, four categories. Not a replacement for
 * any page's own filtering (Players has real server-side search/
 * pagination); this is a fast "where do I want to go" jump: players
 * link straight to their profile, clubs/nationalities pre-fill the
 * Players page's own filters, competitions link straight to their page.
 */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  const { data: results, loading } = useAsync(() => globalSearch(debounced), [debounced]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const hasResults =
    results && (results.players.length > 0 || results.clubs.length > 0 || results.competitions.length > 0 || results.nationalities.length > 0);

  return (
    <div className="relative w-full max-w-sm" ref={ref}>
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search player, club, competition, nationality…"
        aria-label="Global search"
        className="w-full rounded-sm border border-kvm-border bg-white py-1.5 pl-8 pr-3 text-sm text-kvm-ink placeholder:text-gray-400 focus-visible:outline-none"
      />

      {open && query.trim() ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-96 overflow-y-auto rounded-sm border border-kvm-border bg-white shadow-lg">
          {loading && !results ? (
            <p className="px-3 py-3 text-xs text-gray-400">Searching…</p>
          ) : !hasResults ? (
            <p className="px-3 py-3 text-xs text-gray-400">No matches for &quot;{query}&quot;.</p>
          ) : (
            <>
              {results!.players.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1.5 border-b border-kvm-border bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <User size={11} aria-hidden="true" /> Players
                  </p>
                  {results!.players.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => go(`/player?id=${p.id}`)}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="text-kvm-ink">{p.name}</span>
                      <span className="text-xs text-gray-400">{p.club ?? "Unknown club"}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {results!.clubs.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1.5 border-b border-t border-kvm-border bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <Building2 size={11} aria-hidden="true" /> Clubs
                  </p>
                  {results!.clubs.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => go(`/players?search=${encodeURIComponent(c)}`)}
                      className="block w-full px-3 py-1.5 text-left text-sm text-kvm-ink hover:bg-gray-50"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              ) : null}

              {results!.competitions.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1.5 border-b border-t border-kvm-border bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <Trophy size={11} aria-hidden="true" /> Competitions
                  </p>
                  {results!.competitions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => go(`/competition?id=${c.id}`)}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="text-kvm-ink">{c.name}</span>
                      {c.area ? <span className="text-xs text-gray-400">{c.area}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}

              {results!.nationalities.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1.5 border-b border-t border-kvm-border bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <Globe2 size={11} aria-hidden="true" /> Nationality
                  </p>
                  {results!.nationalities.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => go(`/players?nationality=${encodeURIComponent(n)}`)}
                      className="block w-full px-3 py-1.5 text-left text-sm text-kvm-ink hover:bg-gray-50"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
