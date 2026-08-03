"use client";

import type { GridSort } from "@/lib/settings/grid";

/**
 * Shown above a grid when a header sort is active.
 *
 * On ranking grids (Day, Chooser) a header sort stands drag down — pass `blocksDrag` so
 * the chip says so. On Outline, drag stays on under a sort and the chip is just a view
 * indicator (a drop clears the sort so the written tree order is visible).
 */
export function SortChip({
  sort,
  columnLabel,
  onClear,
  blocksDrag = false,
}: {
  sort: GridSort;
  /** Human label for the sorted column (its header text). */
  columnLabel: string;
  onClear: () => void;
  /** When true, row drag is off until the sort is cleared (Day / Chooser ranks). */
  blocksDrag?: boolean;
}) {
  const arrow = sort.direction === "asc" ? "↑" : "↓";

  return (
    <div
      role="status"
      className="flex flex-none items-center gap-2 border-b border-rule bg-surface-raised/60 px-3 py-1.5 text-[0.8125rem] text-ink-muted"
    >
      <span>
        Sorted by {columnLabel} {arrow}
        {blocksDrag && <span className="text-ink-faint"> · drag off</span>}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="rounded border border-rule px-1.5 py-0.5 text-[0.75rem] leading-none text-ink transition-colors hover:border-rule-strong hover:bg-surface"
      >
        clear
      </button>
    </div>
  );
}

/** Resolve a column id to its header label; fall back to the id if the column is gone. */
export function sortColumnLabel(
  sort: GridSort | null,
  columns: { id: string; label: string }[],
): string {
  if (!sort) return "";
  return columns.find((column) => column.id === sort.columnId)?.label ?? sort.columnId;
}
