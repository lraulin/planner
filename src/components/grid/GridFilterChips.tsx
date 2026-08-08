"use client";

import { useMemo } from "react";
import { buildGridChips, type GridChip } from "@/lib/grid/chips";
import type { CrossColumnFilter } from "@/lib/grid/crossFilter";
import { filterOptions, type ColumnFilter } from "@/lib/grid/filters";
import type { ColumnMeta } from "./columns";

/**
 * What is currently narrowing the grid, and how many rows survived it.
 *
 * Three controls filter these grids — column funnels, the advanced builder, and the search
 * box — and two of them are invisible the moment their popover closes. Without this bar a
 * user looking at forty rows out of three hundred has no way to see what they asked for,
 * and no way to undo one piece of it short of clearing everything.
 *
 * Renders nothing at all when nothing is active, so an unfiltered grid loses no vertical
 * space to a row that would always read "Showing 312 of 312".
 */
export function GridFilterChips({
  columns,
  distinctValues,
  filters,
  advancedFilter,
  search,
  shown,
  total,
  onClearColumn,
  onRemoveCondition,
  onClearSearch,
  onClearAll,
}: {
  /** Every column the tab defines, for labelling chips on hidden columns too. */
  columns: ColumnMeta[];
  distinctValues: Record<string, string[]>;
  filters: Record<string, ColumnFilter>;
  advancedFilter: CrossColumnFilter | null;
  search: string;
  shown: number;
  total: number;
  onClearColumn: (columnId: string) => void;
  onRemoveCondition: (index: number) => void;
  onClearSearch: () => void;
  onClearAll: () => void;
}) {
  const byId = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );

  const chips = useMemo(
    () =>
      buildGridChips({
        filters,
        advancedFilter,
        search,
        labelOf: (columnId) => byId.get(columnId)?.label ?? columnId,
        optionLabelOf: (columnId, optionId) => {
          const column = byId.get(columnId);
          // A value entry reads through the column's own `filterLabel`, so a chip says
          // "Not started" wherever the set filter said "Not started" — the State column
          // stores Achieve's two-letter code, and a chip showing `NS` beside a list
          // showing `Not started` looks like two different filters.
          if (column?.filterLabel && optionId.startsWith("value:")) {
            return column.filterLabel(optionId.slice("value:".length));
          }
          const options = filterOptions(
            column?.filterKind,
            distinctValues[columnId] ?? [],
          );
          return options.find((option) => option.id === optionId)?.label ?? optionId;
        },
        // Only the values a column actually holds, so "all but Completed" means all but the
        // ones on screen — not all but every state the enum could ever have.
        domainOf: (columnId) =>
          (distinctValues[columnId] ?? []).map((value) => `value:${value}`),
      }),
    [filters, advancedFilter, search, byId, distinctValues],
  );

  // Renders for the count alone when something other than a filter is holding rows back —
  // the Task Chooser's Show More limit is the case: `Showing 20 of 47` is exactly the thing
  // the user needs to know there, and it used to be a second, separately-computed number on
  // the toolbar that disagreed with this one.
  if (chips.length === 0 && shown >= total) return null;

  return (
    <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-rule bg-surface-raised/40 px-3 py-1.5 text-[0.75rem]">
      <span className="tabular-nums whitespace-nowrap text-ink-muted">
        Showing <strong className="font-semibold text-ink">{shown}</strong> of {total}
      </span>

      {chips.length > 0 && (
        <span aria-hidden className="text-ink-faint">
          ·
        </span>
      )}

      {chips.map((chip) => (
        <Chip
          key={chip.key}
          chip={chip}
          onRemove={() =>
            removeChip(chip, { onClearColumn, onRemoveCondition, onClearSearch })
          }
        />
      ))}

      {/* Nothing to clear when the bar is here only to report a count. */}
      {chips.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="min-h-tap ml-auto flex-none rounded px-2 py-0.5 whitespace-nowrap text-ink-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-ink md:min-h-0"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function removeChip(
  chip: GridChip,
  handlers: {
    onClearColumn: (columnId: string) => void;
    onRemoveCondition: (index: number) => void;
    onClearSearch: () => void;
  },
) {
  if (chip.kind === "column") handlers.onClearColumn(chip.columnId);
  else if (chip.kind === "condition") handlers.onRemoveCondition(chip.index);
  else handlers.onClearSearch();
}

function Chip({ chip, onRemove }: { chip: GridChip; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-rule bg-surface py-0.5 pr-1 pl-2 text-ink">
      <span className="min-w-0 truncate" title={chip.label}>
        {chip.label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        title={`Remove ${chip.label}`}
        aria-label={`Remove filter: ${chip.label}`}
        className="min-h-tap flex-none rounded-full px-1.5 leading-none text-ink-faint transition-colors hover:bg-surface-raised hover:text-ink md:min-h-0"
      >
        ×
      </button>
    </span>
  );
}
