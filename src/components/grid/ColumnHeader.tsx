"use client";

import { useEffect, useId, useRef, useState } from "react";
import { alignClass, type ColumnDef, type FilterKind } from "./columns";
import {
  ALL_FILTER,
  filterOptions,
  type ColumnFilter,
  type FilterOption,
} from "./filters";

/**
 * One header cell: label, optional sort indicator, optional filter funnel that opens the
 * Achieve-style dropdown of presets and distinct values.
 */
export function ColumnHeaderRow<TCtx>({
  columns,
  gridTemplate,
  sort,
  onSort,
  filters,
  onFilterChange,
  distinctValues,
  enableFilters = false,
}: {
  columns: ColumnDef<TCtx>[];
  gridTemplate: string;
  sort?: { columnId: string; direction: "asc" | "desc" } | null;
  onSort?: (columnId: string) => void;
  filters?: Record<string, ColumnFilter>;
  onFilterChange?: (columnId: string, filter: ColumnFilter) => void;
  /** Distinct filter values per column id, from the unfiltered row set. */
  distinctValues?: Record<string, string[]>;
  enableFilters?: boolean;
}) {
  return (
    <div
      className="grid flex-none items-center border-b border-rule-strong bg-surface-raised px-3 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
      style={{
        gridTemplateColumns: gridTemplate,
        columnGap: "0.75rem",
        height: "var(--row-height)",
      }}
    >
      {columns.map((column) => {
        const sorted = sort?.columnId === column.id ? sort.direction : null;
        const filter = filters?.[column.id] ?? ALL_FILTER;
        const filterActive = filter.id !== "all";

        return (
          <div
            key={column.id}
            className={`flex min-w-0 items-center gap-0.5 ${alignClass(column.align)}`}
          >
            <button
              type="button"
              disabled={!column.sortValue || !onSort}
              onClick={() => onSort?.(column.id)}
              className={[
                "min-w-0 truncate uppercase tracking-wider",
                column.sortValue && onSort
                  ? "cursor-pointer hover:text-ink"
                  : "cursor-default",
              ].join(" ")}
            >
              {column.label}
              {sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : ""}
            </button>

            {enableFilters && column.filterValue && onFilterChange && (
              <FilterButton
                columnId={column.id}
                label={column.label}
                kind={column.filterKind}
                filter={filter}
                active={filterActive}
                options={filterOptions(
                  column.filterKind,
                  distinctValues?.[column.id] ?? [],
                )}
                onChange={(next) => onFilterChange(column.id, next)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FilterButton({
  columnId,
  label,
  kind,
  filter,
  active,
  options,
  onChange,
}: {
  columnId: string;
  label: string;
  kind: FilterKind | undefined;
  filter: ColumnFilter;
  active: boolean;
  options: FilterOption[];
  onChange: (filter: ColumnFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // kind is reserved for future custom-builder entry points; presets already use it via options.
  void kind;
  void columnId;

  return (
    <div ref={rootRef} className="relative flex-none">
      <button
        type="button"
        aria-label={`Filter ${label}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={[
          "rounded px-0.5 text-[0.625rem] leading-none",
          active ? "text-priority-a" : "text-ink-faint hover:text-ink",
        ].join(" ")}
      >
        ▾
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full left-0 z-40 mt-1 max-h-64 min-w-[12rem] overflow-auto rounded border border-rule-strong bg-surface py-1 shadow-lg"
        >
          {options.map((option) => {
            const selected = filter.id === option.id;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange({ id: option.id });
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full px-3 py-1 text-left text-[0.8125rem] normal-case tracking-normal",
                    selected
                      ? "bg-select font-medium text-ink"
                      : "text-ink hover:bg-surface-raised",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
