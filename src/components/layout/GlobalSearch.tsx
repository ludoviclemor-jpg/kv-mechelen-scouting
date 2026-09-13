"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, User, Building2, Trophy, Globe2, AlertTriangle } from "lucide-react";
import { globalSearch } from "@/lib/search";
import { useAsync } from "@/lib/players-data";
import { stripAccents } from "@/lib/utils";

const MIN_QUERY_LENGTH = 2;

/** 300ms — matches every other debounced search in the app. */
function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Wraps the first accent/case-insensitive match of `query` inside `text` in a <mark>. Falls back to plain text if nothing matches (can happen when a result matched on a *different* field, e.g. a player found via club/league, not name). */
function Highlight({ text, query }: { text: string; query: string }) {
  const normalizedText = stripAccents(text).toLowerCase();
  const normalizedQuery = stripAccents(query).toLowerCase().trim();
  if (!normalizedQuery) return <>{text}</>;
  const index = normalizedText.indexOf(normalizedQuery);
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-kvm-yellow/60 text-inherit">{text.slice(index, index + normalizedQuery.length)}</mark>
      {text.slice(index + normalizedQuery.length)}
    </>
  );
}

interface FlatEntry {
  key: string;
  go: () => void;
}

/**
 * Top-of-app search — one box, four categories. Not a replacement for
 * any page's own filtering (Players has real server-side search/
 * pagination); this is a fast "where do I want to go" jump: players
 * link straight to their profile, clubs/nationalities pre-fill the
 * Players page's own filters, competitions link straight to their page.
 *
 * Real bugs fixed here (2026-09-11 investigation — the search backend
 * itself, RLS included, was confirmed live to work): no keyboard
 * navigation at all, a single failing sub-query silently discarding
 * already-successful player results with no error shown (see
 * src/lib/search.ts), and firing a query on every single keystroke
 * including the first character.
 */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounced = useDebounced(query);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchTerm = debounced.trim().length >= MIN_QUERY_LENGTH ? debounced : "";
  const { data: results, loading, error } = useAsync(() => globalSearch(searchTerm), [searchTerm]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function go(href: string) {
    setOpen(false);
    setActiveIndex(-1);
    setQuery("");
    router.push(href);
  }

  const flatEntries = useMemo<FlatEntry[]>(() => {
    if (!results) return [];
    const entries: FlatEntry[] = [];
    for (const p of results.players) entries.push({ key: `player-${p.id}`, go: () => go(`/player?id=${p.id}`) });
    for (const c of results.clubs) entries.push({ key: `club-${c}`, go: () => go(`/players?search=${encodeURIComponent(c)}`) });
    for (const c of results.competitions) entries.push({ key: `competition-${c.id}`, go: () => go(`/competition?id=${c.id}`) });
    for (const n of results.nationalities) entries.push({ key: `nationality-${n}`, go: () => go(`/players?nationality=${encodeURIComponent(n)}`) });
    return entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` closes over stable setters/router only
  }, [results]);

  const showDropdown = open && debounced.trim().length >= MIN_QUERY_LENGTH;
  const hasResults = flatEntries.length > 0;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hasResults) setActiveIndex((i) => (i + 1) % flatEntries.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hasResults) setActiveIndex((i) => (i <= 0 ? flatEntries.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatEntries[activeIndex] ?? flatEntries[0];
      target?.go();
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="relative w-full max-w-sm" ref={ref}>
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(-1); // a fresh keystroke invalidates whatever was highlighted from the previous result set
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search player, club, competition, nationality…"
        aria-label="Global search"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="global-search-results"
        aria-activedescendant={activeIndex >= 0 ? flatEntries[activeIndex]?.key : undefined}
        autoComplete="off"
        className="w-full rounded-md border border-kvm-border bg-white py-1.5 pl-8 pr-3 text-sm text-kvm-ink placeholder:text-gray-400 focus-visible:outline-none"
      />

      {showDropdown ? (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-96 overflow-y-auto rounded-md border border-kvm-border bg-white shadow-lg"
        >
          {error ? (
            <p className="flex items-center gap-1.5 px-3 py-3 text-xs font-medium text-kvm-red">
              <AlertTriangle size={13} aria-hidden="true" />
              {error.message}
            </p>
          ) : null}

          {loading && !results ? (
            <p className="px-3 py-3 text-xs text-gray-400">Searching…</p>
          ) : results?.error && !hasResults ? (
            <p className="px-3 py-3 text-xs font-medium text-kvm-red">{results.error}</p>
          ) : !hasResults ? (
            <p className="px-3 py-3 text-xs text-gray-400">No players found for &quot;{debounced.trim()}&quot;.</p>
          ) : (
            <>
              {results!.error ? (
                <p className="flex items-center gap-1.5 border-b border-kvm-border bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                  <AlertTriangle size={11} aria-hidden="true" />
                  {results!.error}
                </p>
              ) : null}

              {results!.players.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1.5 border-b border-kvm-border bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <User size={11} aria-hidden="true" /> Players
                  </p>
                  {results!.players.map((p) => {
                    const key = `player-${p.id}`;
                    const index = flatEntries.findIndex((e) => e.key === key);
                    return (
                      <button
                        id={key}
                        key={key}
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => go(`/player?id=${p.id}`)}
                        className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${index === activeIndex ? "bg-gray-50" : "hover:bg-gray-50"}`}
                      >
                        <span className="text-kvm-ink">
                          <Highlight text={p.name} query={debounced} />
                        </span>
                        <span className="text-xs text-gray-400">{p.club ?? "Unknown club"}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {results!.clubs.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1.5 border-b border-t border-kvm-border bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <Building2 size={11} aria-hidden="true" /> Clubs
                  </p>
                  {results!.clubs.map((c) => {
                    const key = `club-${c}`;
                    const index = flatEntries.findIndex((e) => e.key === key);
                    return (
                      <button
                        id={key}
                        key={key}
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => go(`/players?search=${encodeURIComponent(c)}`)}
                        className={`block w-full px-3 py-1.5 text-left text-sm text-kvm-ink ${index === activeIndex ? "bg-gray-50" : "hover:bg-gray-50"}`}
                      >
                        <Highlight text={c} query={debounced} />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {results!.competitions.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1.5 border-b border-t border-kvm-border bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <Trophy size={11} aria-hidden="true" /> Competitions
                  </p>
                  {results!.competitions.map((c) => {
                    const key = `competition-${c.id}`;
                    const index = flatEntries.findIndex((e) => e.key === key);
                    return (
                      <button
                        id={key}
                        key={key}
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => go(`/competition?id=${c.id}`)}
                        className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${index === activeIndex ? "bg-gray-50" : "hover:bg-gray-50"}`}
                      >
                        <span className="text-kvm-ink">
                          <Highlight text={c.name} query={debounced} />
                        </span>
                        {c.area ? <span className="text-xs text-gray-400">{c.area}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {results!.nationalities.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1.5 border-b border-t border-kvm-border bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <Globe2 size={11} aria-hidden="true" /> Nationality
                  </p>
                  {results!.nationalities.map((n) => {
                    const key = `nationality-${n}`;
                    const index = flatEntries.findIndex((e) => e.key === key);
                    return (
                      <button
                        id={key}
                        key={key}
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => go(`/players?nationality=${encodeURIComponent(n)}`)}
                        className={`block w-full px-3 py-1.5 text-left text-sm text-kvm-ink ${index === activeIndex ? "bg-gray-50" : "hover:bg-gray-50"}`}
                      >
                        <Highlight text={n} query={debounced} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
