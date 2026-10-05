"use client";

import { useMemo } from "react";
import { buildGridChips, type GridChip } from "@/lib/grid/chips";
import type { CrossColumnFilter } from "@/lib/grid/crossFilter";
import { isCalendarDayKind } from "@/lib/grid/customFilter";
import { filterOptions, type ColumnFilter } from "@/lib/grid/filters";
import type { ColumnMeta } from "./columns";
import { useDateFormatter } from "@/components/settings/SettingsProvider";

/**
 * What is narrowing a grid, as the chips the filter bar shows. One hook so the bar and the
 * export say the same thing in the same words — an export that described its filters
 * differently from the screen it was taken from would be one more thing to reconcile.
 */
export function useGridChips({
  columns,
  distinctValues,
  filters,
  advancedFilter,
  search,
}: {
  /** Every column the tab defines, for labelling chips on hidden columns too. */
  columns: readonly ColumnMeta[];
  distinctValues: Record<string, string[]>;
  filters: Record<string, ColumnFilter>;
  advancedFilter: CrossColumnFilter | null;
  search: string;
}): GridChip[] {
  const formatDate = useDateFormatter();
  const byId = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );

  return useMemo(
    () =>
      buildGridChips({
        filters,
        advancedFilter,
        search,
        labelOf: (columnId) => byId.get(columnId)?.label ?? columnId,
        optionLabelOf: (columnId, optionId) => {
          const column = byId.get(columnId);
          if (isCalendarDayKind(column?.filterKind) && optionId.startsWith("value:")) {
            return formatDate(optionId.slice("value:".length));
          }
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
        operandLabelOf: (columnId, value) => {
          const kind = byId.get(columnId)?.filterKind;
          if (isCalendarDayKind(kind)) return formatDate(value);
          // Blank number operands mean 0; the chip has to agree or Amount > 0 reads as
          // `[Amount] > ''`.
          if (kind === "number" && value.trim() === "") return "0";
          return value;
        },
        // Only the values a column actually holds, so "all but Completed" means all but the
        // ones on screen — not all but every state the enum could ever have.
        domainOf: (columnId) =>
          (distinctValues[columnId] ?? []).map((value) => `value:${value}`),
      }),
    [filters, advancedFilter, search, byId, distinctValues, formatDate],
  );
}
