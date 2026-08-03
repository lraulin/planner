"use client";

import type { GridSort } from "@/lib/settings/grid";

/**
 * Shown above a manually-ordered grid when a header sort is active.
 *
 * Sorting on Outline, Day, and the Chooser is a non-destructive view: it never writes
 * `sortKey`, so the chip both explains why drag is disabled and is the one way back to
 * the hand-built order.
 */
export function SortChip({
  sort,
  columnLabel,
  onClear,
}: {
  sort: GridSort;
  /** Human label for the sorted column (its header text). */
  columnLabel: string;
  onClear: () => void;
}) {
  const arrow = sort.direction === "asc" ? "↑" : "↓";

  return (
    <div
      role="status"
      className="flex flex-none items-center gap-2 border-b border-rule bg-surface-raised/60 px-3 py-1.5 text-[0.8125rem] text-ink-muted"
    >
      <span>
        Sorted by {columnLabel} {arrow}
        <span className="text-ink-faint"> · drag off</span>
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
