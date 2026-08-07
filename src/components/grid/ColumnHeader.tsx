"use client";

import {
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "@/lib/settings/grid";
import type { SortDirection } from "@/lib/settings/grid";
import type { ColumnValues } from "@/lib/grid/distinct";
import { headerDropIndex } from "@/lib/grid/columnMenu";
import { alignClass, type ColumnControls, type ColumnMeta } from "./columns";
import { ColumnMenuButton } from "./ColumnMenu";
import { ShowFieldsDialog } from "./ShowFieldsDialog";
import { ALL_FILTER, type ColumnFilter } from "@/lib/grid/filters";

/** Marks a header drag so a row drag (same HTML5 mechanism) is never mistaken for one. */
const COLUMN_MIME = "application/x-planner-column";

/**
 * One header cell: label (click to sort, drag to reorder), the column menu, and the resize
 * handle.
 *
 * Every control that acts on a column lives in the menu (`ColumnMenu.tsx`); the gestures on
 * this row are shortcuts to things the menu also offers, never the only path to them. That
 * is the rule that lets drag-to-reorder exist at all — see `data-grid.md`.
 */
export function ColumnHeaderRow({
  columns,
  allColumns,
  gridTemplate,
  sorts = [],
  onSort,
  onSetSort,
  filters,
  onFilterChange,
  distinctValues,
  columnValues,
  enableFilters = false,
  onResize,
  onResetWidth,
  widths = {},
  controls,
  leadingGutter = false,
}: {
  // `ColumnMeta` rather than `ColumnDef`: the header never renders a cell, so it has no
  // business knowing what a row is.
  columns: ColumnMeta[];
  /** Every column the tab defines, for the menu's Show Fields dialog. Defaults to `columns`. */
  allColumns?: ColumnMeta[];
  gridTemplate: string;
  /** Sort keys, primary first. Empty is unsorted. */
  sorts?: readonly { columnId: string; direction: SortDirection }[];
  /** `additive` is a Shift-click: refine the sort rather than replacing it. */
  onSort?: (columnId: string, additive: boolean) => void;
  /** Explicit-direction sort, for the menu. Omit to leave its sort items unavailable. */
  onSetSort?: (columnId: string, direction: SortDirection | null) => void;
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
  /** Stored width overrides, so the menu knows whether Reset width would do anything. */
  widths?: Record<string, number>;
  /** Show / hide / move / reset. Omit to leave the layout items unavailable. */
  controls?: ColumnControls;
  /**
   * Blank cell matching the row handle track. The handle is grid chrome, not a column, so
   * it never gets a header label or a menu.
   */
  leadingGutter?: boolean;
}) {
  // One at a time: a second open menu beside the first is two popovers claiming to describe
  // the column under the cursor.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  /** Slot the drop would land in (0…columns.length), measured against the current order. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const order = columns.map((column) => column.id);
  const fieldColumns = allColumns ?? columns;
  const canReorder = controls !== undefined && columns.length > 1;

  function endDrag() {
    setDragId(null);
    setDropIndex(null);
  }

  function onCellDragOver(index: number, event: ReactDragEvent<HTMLDivElement>) {
    // Only our own header drag is accepted. A row drag passing over the header must fall
    // through to the browser's no-drop cursor rather than looking like a column move.
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const past = event.clientX - rect.left > rect.width / 2;
    setDropIndex(headerDropIndex(index, past));
  }

  function onCellDrop(index: number, event: ReactDragEvent<HTMLDivElement>) {
    if (!dragId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const past = event.clientX - rect.left > rect.width / 2;
    const target = dropIndex ?? headerDropIndex(index, past);
    const id = dragId;
    endDrag();
    controls?.place(id, target);
  }

  return (
    <>
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
        {columns.map((column, index) => {
          const sortIndex = sorts.findIndex((entry) => entry.columnId === column.id);
          const sorted = sortIndex === -1 ? null : sorts[sortIndex].direction;
          const filter = filters?.[column.id] ?? ALL_FILTER;
          const filterable = enableFilters && Boolean(column.filterValue);
          const sortable = Boolean(column.sortValue) && onSort !== undefined;

          return (
            <div
              key={column.id}
              onDragOver={(event) => onCellDragOver(index, event)}
              onDrop={(event) => onCellDrop(index, event)}
              onContextMenu={(event) => {
                // Right-click anywhere on the header opens that column's menu, the way a
                // Windows list header does. The row menu does the same one row down.
                event.preventDefault();
                setOpenMenuId(column.id);
              }}
              className={[
                "relative flex h-full min-w-0 items-center gap-0.5 self-stretch",
                alignClass(column.align),
                dragId === column.id ? "opacity-40" : "",
              ].join(" ")}
            >
              {/* Insertion line at the boundary this drop would land on. */}
              {dropIndex === index && <DropMark side="left" />}
              {dropIndex === index + 1 && <DropMark side="right" />}

              <button
                type="button"
                draggable={canReorder || undefined}
                // Not `disabled`: a disabled button cannot start a drag, and an unsortable
                // column still reorders. It simply has no click handler instead.
                disabled={!sortable && !canReorder}
                onClick={
                  sortable ? (event) => onSort?.(column.id, event.shiftKey) : undefined
                }
                onDragStart={(event) => {
                  // Modifier-click is an additive sort, not a drag.
                  if (event.shiftKey || event.metaKey || event.ctrlKey) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.setData(COLUMN_MIME, column.id);
                  event.dataTransfer.setData("text/plain", column.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDragId(column.id);
                }}
                onDragEnd={endDrag}
                title={[
                  sortable
                    ? "Click to sort · Shift-click to add a secondary sort"
                    : null,
                  canReorder ? "Drag to reorder" : null,
                  "Right-click for the column menu",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                className={[
                  "min-w-0 truncate uppercase tracking-wider",
                  sortable ? "cursor-pointer hover:text-ink" : "",
                  canReorder && !sortable ? "cursor-grab active:cursor-grabbing" : "",
                  !sortable && !canReorder ? "cursor-default" : "",
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

              <ColumnMenuButton
                column={column}
                order={order}
                open={openMenuId === column.id}
                onOpenChange={(next) => setOpenMenuId(next ? column.id : null)}
                sorts={sorts}
                onSetSort={onSetSort}
                filter={filter}
                onFilterChange={
                  filterable && onFilterChange
                    ? (next) => onFilterChange(column.id, next)
                    : undefined
                }
                values={columnValues?.[column.id]}
                distinctValues={distinctValues?.[column.id] ?? []}
                controls={controls}
                widths={widths}
                onResetWidth={onResetWidth}
                onOpenFields={controls ? () => setFieldsOpen(true) : undefined}
              />

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

      {controls && (
        <ShowFieldsDialog
          open={fieldsOpen}
          allColumns={fieldColumns}
          shownIds={order}
          onShow={controls.show}
          onHide={controls.hide}
          onMove={controls.move}
          onPlace={controls.place}
          onReset={controls.resetColumns}
          onResetGrid={controls.resetGrid}
          onClose={() => setFieldsOpen(false)}
        />
      )}
    </>
  );
}

/** Where a dragged column would land, drawn on the boundary rather than over a cell. */
function DropMark({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={[
        "pointer-events-none absolute inset-y-0.5 z-30 w-0.5 rounded-full bg-select-edge",
        side === "left" ? "-left-1.5" : "-right-1.5",
      ].join(" ")}
    />
  );
}

/**
 * Drag the right edge of a header cell to set that column's width.
 *
 * The width is measured from the header cell's own box rather than tracked as a delta, so
 * a drag that outruns the pointer — or starts on a column whose track is a `fr` unit —
 * still lands on the width actually on screen. Double-click clears the override, as does
 * Reset width in the column menu, which is the discoverable version of the same thing.
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
