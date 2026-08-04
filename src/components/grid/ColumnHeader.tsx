"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "@/lib/settings/grid";
import {
  isCustomFilter,
  isOptionsFilter,
  optionsFilter,
  type CustomColumnFilter,
} from "@/lib/grid/customFilter";
import type { ColumnValues } from "@/lib/grid/distinct";
import {
  buildSetFilterEntries,
  matchesSearch,
  onlySelection,
  selectAllState,
  toggleSetEntry,
} from "@/lib/grid/setFilter";
import { alignClass, type ColumnMeta, type FilterKind } from "./columns";
import { CustomFilterDialog } from "./CustomFilterDialog";
import {
  ALL_FILTER,
  filterActive,
  presetOptions,
  usesSetFilter,
  type ColumnFilter,
  type FilterOption,
} from "./filters";

/**
 * One header cell: label, optional sort indicator, optional filter funnel that opens the
 * Achieve-style dropdown of presets and distinct values, plus (Custom)... for the criteria
 * dialog.
 */
export function ColumnHeaderRow({
  columns,
  gridTemplate,
  sorts = [],
  onSort,
  filters,
  onFilterChange,
  distinctValues,
  columnValues,
  enableFilters = false,
  onResize,
  onResetWidth,
  leadingGutter = false,
}: {
  // `ColumnMeta` rather than `ColumnDef`: the header never renders a cell, so it has no
  // business knowing what a row is.
  columns: ColumnMeta[];
  gridTemplate: string;
  /** Sort keys, primary first. Empty is unsorted. */
  sorts?: readonly { columnId: string; direction: "asc" | "desc" }[];
  /** `additive` is a Shift-click: refine the sort rather than replacing it. */
  onSort?: (columnId: string, additive: boolean) => void;
  filters?: Record<string, ColumnFilter>;
  onFilterChange?: (columnId: string, filter: ColumnFilter) => void;
  /** Distinct filter values per column id, from the unfiltered row set. */
  distinctValues?: Record<string, string[]>;
  /** The same values with per-value row counts, for the set filter's list. */
  columnValues?: Record<string, ColumnValues>;
  enableFilters?: boolean;
  /** Omit to leave columns unresizable, as a grid with nowhere to store widths should. */
  onResize?: (columnId: string, width: number) => void;
  onResetWidth?: (columnId: string) => void;
  /**
   * Blank cell matching the row handle track. The handle is grid chrome, not a column, so
   * it never gets a header label or a filter.
   */
  leadingGutter?: boolean;
}) {
  return (
    <div
      className="grid flex-none items-center border-b border-rule-strong bg-surface-raised pr-3 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
      style={{
        gridTemplateColumns: gridTemplate,
        columnGap: "0.75rem",
        height: "var(--row-height)",
      }}
    >
      {leadingGutter && (
        <div aria-hidden className="h-full self-stretch border-r border-rule/50" />
      )}
      {columns.map((column) => {
        const sortIndex = sorts.findIndex((entry) => entry.columnId === column.id);
        const sorted = sortIndex === -1 ? null : sorts[sortIndex].direction;
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
              onClick={(event) => onSort?.(column.id, event.shiftKey)}
              title={
                column.sortValue && onSort
                  ? "Click to sort · Shift-click to add a secondary sort"
                  : undefined
              }
              className={[
                "min-w-0 truncate uppercase tracking-wider",
                column.sortValue && onSort
                  ? "cursor-pointer hover:text-ink"
                  : "cursor-default",
                sorted ? "text-ink" : "",
              ].join(" ")}
            >
              {column.label}
              {sorted && (
                <span className="ml-0.5 whitespace-nowrap">
                  {sorted === "asc" ? "↑" : "↓"}
                  {/* The rank only appears once there is more than one key — a lone "1"
                      beside a single sorted column is noise. */}
                  {sorts.length > 1 && (
                    <span className="align-super text-[0.5625rem] tabular-nums">
                      {sortIndex + 1}
                    </span>
                  )}
                </span>
              )}
            </button>

            {enableFilters && Boolean(column.filterValue) && onFilterChange && (
              <FilterButton
                label={column.label}
                kind={column.filterKind}
                filterLabel={column.filterLabel}
                filter={filter}
                active={active}
                values={columnValues?.[column.id]}
                presets={presetOptions(column.filterKind)}
                distinctValues={distinctValues?.[column.id] ?? []}
                onChange={(next) => onFilterChange(column.id, next)}
              />
            )}

            {onResize && (
              <ResizeHandle
                label={column.label}
                onResize={(width) => onResize(column.id, width)}
                onReset={() => onResetWidth?.(column.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FilterButton({
  label,
  kind,
  filterLabel,
  filter,
  active,
  values,
  presets,
  distinctValues,
  onChange,
}: {
  label: string;
  kind: FilterKind | undefined;
  /** Presentation for a stored value — see `ColumnDef.filterLabel`. */
  filterLabel?: (value: string) => string;
  filter: ColumnFilter;
  active: boolean;
  /** Values this column holds and how many rows hold each. */
  values: ColumnValues | undefined;
  /** Semantic bands for this kind (priority, deadline). Empty for most columns. */
  presets: FilterOption[];
  /** Plain value list, for the custom-criteria dialog's operand picker. */
  distinctValues: string[];
  onChange: (filter: ColumnFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  const customActive = isCustomFilter(filter) && filterActive(filter);
  const optionIds = isOptionsFilter(filter) ? filter.ids : [];
  // Priority (and any future kind with open-ended ranks) skips the value checklist —
  // see `usesSetFilter`. Matching still accepts `value:…` ids if an old filter stored one.
  const showSetFilter = usesSetFilter(kind);

  // Every entry, regardless of the search box — the search hides rows from the list but
  // must not drop them from the selection being computed.
  const allEntries = showSetFilter
    ? buildSetFilterEntries({
        values,
        selectedIds: optionIds,
        labelOf: filterLabel,
      })
    : [];
  const shown = matchesSearch(allEntries, search);
  const allSelected = selectAllState(allEntries) === "all";

  // A handful of states needs no search box; forty result areas do.
  const showSearch = showSetFilter && allEntries.length > SEARCH_THRESHOLD;

  const setIds = (ids: string[]) =>
    onChange(ids.length === 0 ? ALL_FILTER : optionsFilter(ids));

  return (
    <div ref={rootRef} className="relative flex-none">
      <button
        type="button"
        aria-label={`Filter ${label}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          // Reset the query on the way in: a stale one would silently hide values the next
          // time the funnel is opened.
          setSearch("");
          setOpen((value) => !value);
        }}
        className={[
          "rounded px-0.5 text-[0.625rem] leading-none",
          active ? "text-priority-a" : "text-ink-faint hover:text-ink",
        ].join(" ")}
      >
        ▾
      </button>

      {open && (
        <div
          id={listId}
          className="absolute top-full left-0 z-40 mt-1 flex max-h-80 w-64 flex-col rounded border border-rule-strong bg-surface shadow-lg"
        >
          {showSearch && (
            <div className="flex-none border-b border-rule p-1.5">
              <input
                type="search"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search values…"
                className="w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] normal-case tracking-normal text-ink outline-none focus:border-select-edge"
              />
            </div>
          )}

          <ul
            role="listbox"
            aria-multiselectable
            aria-label={showSetFilter ? `${label} values` : `${label} ranges`}
            className="min-h-0 flex-1 overflow-auto py-1"
          >
            {showSetFilter && (
              <>
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={allSelected}
                    disabled={allSelected}
                    onClick={() => onChange(ALL_FILTER)}
                    title={
                      allSelected
                        ? "Every value is already showing"
                        : "Show every value again"
                    }
                    className="flex w-full items-center gap-2 border-b border-rule/60 px-2 py-1 text-left text-[0.8125rem] normal-case tracking-normal text-ink hover:bg-surface-raised disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <Tick state={allSelected ? "all" : "some"} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      (Select all)
                    </span>
                  </button>
                </li>

                {shown.length === 0 ? (
                  <li className="px-3 py-3 text-[0.8125rem] normal-case tracking-normal text-ink-faint">
                    {allEntries.length === 0 ? "No values to filter." : "No match."}
                  </li>
                ) : (
                  shown.map((entry) => (
                    <li key={entry.optionId} className="group flex items-center">
                      <button
                        type="button"
                        role="option"
                        aria-selected={entry.selected}
                        onClick={() =>
                          setIds(toggleSetEntry(allEntries, optionIds, entry.optionId))
                        }
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left text-[0.8125rem] normal-case tracking-normal text-ink hover:bg-surface-raised"
                      >
                        <Tick state={entry.selected ? "all" : "none"} />
                        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                        <span className="flex-none tabular-nums text-[0.6875rem] text-ink-faint">
                          {entry.count}
                        </span>
                      </button>
                      {/*
                        Excel's "Only this". Without it, narrowing to one value out of thirty
                        means unticking twenty-nine. Dimmed until hover or focus rather than
                        hidden, so it is still tabbable — this popover has no compact
                        counterpart (there is no column header below `md`), so the
                        always-visible-action rule in `ux-principles.md` is not in play.
                      */}
                      <button
                        type="button"
                        onClick={() => setIds(onlySelection(entry.optionId))}
                        title={`Show only ${entry.label}`}
                        className="mr-1 flex-none rounded px-1.5 py-0.5 text-[0.6875rem] normal-case tracking-normal text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-raised hover:text-ink focus:opacity-100"
                      >
                        only
                      </button>
                    </li>
                  ))
                )}
              </>
            )}

            {presets.length > 0 && (
              <>
                {/* Divider only when ranges sit under a value list; alone they are the list. */}
                {showSetFilter && (
                  <li
                    aria-hidden
                    className="mt-1 border-t border-rule px-2 pt-1.5 pb-0.5 text-[0.625rem] font-medium tracking-wider text-ink-faint uppercase"
                  >
                    Ranges
                  </li>
                )}
                {presets.map((preset) => {
                  const selected = optionIds.includes(preset.id);
                  return (
                    <li key={preset.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => onChange(togglePreset(filter, preset.id))}
                        className={[
                          "flex w-full items-center gap-2 px-2 py-1 text-left text-[0.8125rem] normal-case tracking-normal",
                          selected
                            ? "bg-select font-medium text-ink"
                            : "text-ink hover:bg-surface-raised",
                        ].join(" ")}
                      >
                        <Tick state={selected ? "all" : "none"} />
                        <span className="min-w-0 truncate">{preset.label}</span>
                      </button>
                    </li>
                  );
                })}
              </>
            )}
          </ul>

          <div className="flex-none border-t border-rule p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCustomOpen(true);
              }}
              className={[
                "w-full rounded px-2 py-1 text-left text-[0.8125rem] normal-case tracking-normal hover:bg-surface-raised",
                customActive ? "font-medium text-ink" : "text-ink-muted",
              ].join(" ")}
            >
              {customActive ? "Custom criteria (on)…" : "Custom criteria…"}
            </button>
          </div>
        </div>
      )}

      <CustomFilterDialog
        open={customOpen}
        columnLabel={label}
        kind={kind}
        filter={isCustomFilter(filter) ? filter : null}
        distinctValues={distinctValues}
        onApply={(next: CustomColumnFilter) => onChange(next)}
        onClose={() => setCustomOpen(false)}
      />
    </div>
  );
}

/** How many values before the list needs its own search box. */
const SEARCH_THRESHOLD = 8;

function Tick({ state }: { state: "all" | "some" | "none" }) {
  return (
    <span
      aria-hidden
      className={[
        "flex h-3.5 w-3.5 flex-none items-center justify-center rounded-[0.1875rem] border text-[0.625rem] leading-none",
        state === "none"
          ? "border-rule-strong text-transparent"
          : "border-select-edge bg-select-edge/20 text-ink",
      ].join(" ")}
    >
      {state === "all" ? "✓" : state === "some" ? "–" : ""}
    </span>
  );
}

/**
 * Toggle a semantic band. Bands are not part of the set list — they describe a range rather
 * than name a value — so they keep the plain add/remove behaviour, and picking one replaces
 * any custom criteria on the column.
 */
function togglePreset(filter: ColumnFilter, id: string): ColumnFilter {
  const current = isOptionsFilter(filter) ? filter.ids : [];
  const next = current.includes(id)
    ? current.filter((entry) => entry !== id)
    : [...current.filter((entry) => entry !== "all"), id];
  return next.length === 0 ? ALL_FILTER : optionsFilter(next);
}

/**
 * Drag the right edge of a header cell to set that column's width.
 *
 * The width is measured from the header cell's own box rather than tracked as a delta, so
 * a drag that outruns the pointer — or starts on a column whose track is a `fr` unit —
 * still lands on the width actually on screen. Double-click clears the override and hands
 * the column back to its declared track, which is the only way back from a `fr` column
 * pinned to a fixed pixel width.
 */
function ResizeHandle({
  label,
  onResize,
  onReset,
}: {
  label: string;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const cell = ref.current?.parentElement;
    if (!cell) return;

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = cell.getBoundingClientRect().width;

    function onMove(move: PointerEvent) {
      onResize(clampWidth(Math.round(startWidth + (move.clientX - startX))));
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label={`Resize ${label}`}
      title="Drag to resize, double-click to reset"
      onPointerDown={beginResize}
      onDoubleClick={onReset}
      className="ml-auto h-4 w-1 flex-none cursor-col-resize rounded-full bg-transparent hover:bg-rule-strong"
    />
  );
}

function clampWidth(width: number): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width));
}
