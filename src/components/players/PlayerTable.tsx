"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Columns3 } from "lucide-react";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { calculateAge, formatCurrency } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ContractBadge } from "@/components/ui/ContractBadge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useEffectiveStatus } from "@/lib/app-store";

export type PlayerSortKey =
  | "name"
  | "age"
  | "position"
  | "nationality"
  | "club"
  | "league"
  | "marketValueEUR"
  | "contractExpiry";

export type SortDirection = "asc" | "desc";

interface Column {
  key: PlayerSortKey;
  label: string;
}

/** "Player" is the identity column, always shown — every other column is optional and toggleable (see ColumnPicker below). */
const MANDATORY_COLUMN: Column = { key: "name", label: "Player" };
const OPTIONAL_COLUMNS: Column[] = [
  { key: "age", label: "Age" },
  { key: "position", label: "Position" },
  { key: "nationality", label: "Nationality" },
  { key: "club", label: "Club" },
  { key: "league", label: "League" },
  { key: "marketValueEUR", label: "Market Value" },
  { key: "contractExpiry", label: "Contract" },
];

const COLUMN_STORAGE_KEY = "kvm.playersTable.visibleColumns.v1";
const DEFAULT_VISIBLE = OPTIONAL_COLUMNS.map((c) => c.key);

/** Per-viewer preference only (browser-local, per redesign item 9's "onthoud de voorkeur") — never a durable, shared setting, so localStorage is the right store, not Postgres. */
function loadVisibleColumns(): PlayerSortKey[] {
  try {
    const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE;
    const valid = parsed.filter((k): k is PlayerSortKey => OPTIONAL_COLUMNS.some((c) => c.key === k));
    return valid.length > 0 ? valid : DEFAULT_VISIBLE;
  } catch {
    return DEFAULT_VISIBLE;
  }
}

function ColumnPicker({ visible, onChange }: { visible: Set<PlayerSortKey>; onChange: (visible: Set<PlayerSortKey>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle(key: PlayerSortKey) {
    const next = new Set(visible);
    if (next.has(key)) {
      if (next.size === 1) return; // keep at least one optional column visible
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-xs font-semibold text-kvm-ink hover:border-kvm-red"
      >
        <Columns3 size={13} aria-hidden="true" />
        Columns
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-kvm-border bg-white p-2 shadow-lg">
          {OPTIONAL_COLUMNS.map((col) => (
            <label key={col.key} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-kvm-ink hover:bg-gray-50">
              <input type="checkbox" checked={visible.has(col.key)} onChange={() => toggle(col.key)} className="accent-kvm-red" />
              {col.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Cell({ columnKey, player }: { columnKey: PlayerSortKey; player: Player }) {
  switch (columnKey) {
    case "age":
      return <td className="tabular-nums">{calculateAge(player.dateOfBirth) ?? "—"}</td>;
    case "position":
      return <td>{positionLabel(player.position)}</td>;
    case "nationality":
      return <td>{player.nationality ?? "Unknown"}</td>;
    case "club":
      return <td>{player.club ?? "Unknown"}</td>;
    case "league":
      return <td className="text-gray-500">{player.league ?? "Unknown"}</td>;
    case "marketValueEUR":
      return <td className="tabular-nums">{formatCurrency(player.marketValueEUR)}</td>;
    case "contractExpiry":
      return (
        <td>
          <ContractBadge expiryIso={player.contractExpiry} />
        </td>
      );
    default:
      return null;
  }
}

function Row({ player, columns }: { player: Player; columns: Column[] }) {
  const status = useEffectiveStatus(player.id, player.status);

  return (
    <tr>
      <td>
        <Link href={`/player?id=${player.id}`} className="flex items-center gap-2 font-semibold text-kvm-ink hover:text-kvm-red hover:underline">
          <PlayerAvatar name={player.name} photoUrl={player.photoUrl} size="sm" />
          {player.name}
        </Link>
      </td>
      {columns.map((col) => (
        <Cell key={col.key} columnKey={col.key} player={player} />
      ))}
      <td>
        <StatusBadge status={status} />
      </td>
    </tr>
  );
}

export function PlayerTable({
  players,
  sortKey,
  sortDirection,
  onSort,
}: {
  players: Player[];
  sortKey: PlayerSortKey;
  sortDirection: SortDirection;
  onSort: (key: PlayerSortKey) => void;
}) {
  // Starts with every column visible (matches static-export server output,
  // avoiding a hydration mismatch) — the real, persisted preference is
  // applied right after mount instead.
  const [visible, setVisible] = useState<Set<PlayerSortKey>>(() => new Set(DEFAULT_VISIBLE));

  useEffect(() => {
    // Reads localStorage only after mount, deliberately — matches the
    // static-export server output on first paint, then applies the real
    // per-viewer preference, avoiding a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(new Set(loadVisibleColumns()));
  }, []);

  function updateVisible(next: Set<PlayerSortKey>) {
    setVisible(next);
    try {
      window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Private-browsing/storage-blocked — the preference just won't persist across reloads, nothing else breaks.
    }
  }

  const activeColumns = OPTIONAL_COLUMNS.filter((c) => visible.has(c.key));

  return (
    <div>
      <div className="flex items-center justify-end px-4 py-2">
        <ColumnPicker visible={visible} onChange={updateVisible} />
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortableHeader label={MANDATORY_COLUMN.label} sortKey={MANDATORY_COLUMN.key} activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              {activeColumns.map((col) => (
                <SortableHeader key={col.key} label={col.label} sortKey={col.key} activeKey={sortKey} direction={sortDirection} onSort={onSort} />
              ))}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <Row key={player.id} player={player} columns={activeColumns} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
