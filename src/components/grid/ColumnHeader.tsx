"use client";

import { useEffect, useId, useRef, useState } from "react";
import { alignClass, type ColumnMeta, type FilterKind } from "./columns";
import {
  ALL_FILTER,
  filterActive,
  filterOptions,
  type ColumnFilter,
  type FilterOption,
} from "./filters";

/**
 * One header cell: label, optional sort indicator, optional filter funnel that opens the
 * Achieve-style dropdown of presets and distinct values.
 */
export function ColumnHeaderRow({
  columns,
  gridTemplate,
  sort,
  onSort,
  filters,
  onFilterChange,
  distinctValues,
  enableFilters = false,
}: {
  // `ColumnMeta` rather than `ColumnDef`: the header never renders a cell, so it has no
  // business knowing what a row is.
  columns: ColumnMeta[];
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
        const active = filterActive(filter);

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

            {enableFilters && Boolean(column.filterValue) && onFilterChange && (
              <FilterButton
                columnId={column.id}
                label={column.label}
                kind={column.filterKind}
                filter={filter}
                active={active}
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
          aria-multiselectable
          className="absolute top-full left-0 z-40 mt-1 max-h-64 min-w-[12rem] overflow-auto rounded border border-rule-strong bg-surface py-1 shadow-lg"
        >
          {options.map((option) => {
            const isAll = option.id === "all";
            const selected = isAll ? !active : filter.includes(option.id);

            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    // "(All)" is the way back to unfiltered, so it closes; ticking values
                    // keeps the list open, because picking several is the whole point.
                    if (isAll) {
                      onChange(ALL_FILTER);
                      setOpen(false);
                      return;
                    }
                    onChange(toggleOption(filter, option.id));
                  }}
                  className={[
                    "flex w-full items-center gap-2 px-3 py-1 text-left text-[0.8125rem] normal-case tracking-normal",
                    selected
                      ? "bg-select font-medium text-ink"
                      : "text-ink hover:bg-surface-raised",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className="w-3 flex-none text-[0.6875rem] text-ink-muted"
                  >
                    {selected ? "✓" : ""}
                  </span>
                  <span className="min-w-0 truncate">{option.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Add or remove one option. Unticking the last one lands on `ALL_FILTER` rather than an
 * empty selection, so "nothing ticked" and "(All)" stay the same state — an empty grid
 * whose filter button looks inactive would be unexplainable.
 */
function toggleOption(filter: ColumnFilter, id: string): ColumnFilter {
  const next = filter.includes(id)
    ? filter.filter((entry) => entry !== id)
    : [...filter.filter((entry) => entry !== "all"), id];
  return next.length === 0 ? ALL_FILTER : next;
}
