"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { OutlineNode } from "@/lib/tree/types";
import type { GridRow } from "@/lib/tree/slice";
import type { DropZone } from "@/lib/tree/dnd";
import { TYPE_LABELS } from "@/lib/tree/hierarchy";
import {
  alignClass,
  buildGridTemplate,
  type ColumnDef,
  type NodeGridRow,
} from "./columns";
import { ColumnHeaderRow } from "./ColumnHeader";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import {
  ALL_FILTER,
  filterActive,
  rowPassesFilters,
  type ColumnFilter,
} from "./filters";
import { sortRowsWithinGroups } from "@/lib/grid/sortRows";
import { resolveCompactFields } from "@/lib/grid/compactFields";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { CompactRow } from "./CompactRow";

export type SortState = { columnId: string; direction: "asc" | "desc" } | null;

/**
 * Opt-in row drag-and-drop. The grid owns the gesture — what counts as a "before" versus an
 * "inside", which row is lit, when the drop line is drawn — and the host owns the meaning:
 * `resolve` says whether a hover is legal and at what depth the indicator belongs, `onDrop`
 * performs the move. Tabs that pass nothing get the previous, undraggable grid.
 */
export type RowDrag = {
  resolve: (
    dragId: string,
    targetId: string,
    zone: DropZone,
  ) => { depth: number } | null;
  onDrop: (dragId: string, targetId: string, zone: DropZone) => void;
};

type DropHint = { targetId: string; zone: DropZone; depth: number };

/** Bindings the grid hands one row so it can take part in a drag. */
type RowDragBinding = {
  dragging: boolean;
  hint: { zone: DropZone; depth: number } | null;
  onStart: () => void;
  /** Returns whether the hover is a legal drop, which decides the cursor. */
  onOver: (zone: DropZone) => boolean;
  onLeave: () => void;
  onDrop: (zone: DropZone) => void;
  onEnd: () => void;
};

/**
 * What a row announces to assistive tech and whether it draws as expandable. These are the
 * only two things the grid needs to know about a row's payload, so they are props rather
 * than an `OutlineNode` dependency baked into the component. The defaults reproduce the
 * tree tabs' behaviour, which is why those tabs pass neither.
 */
type RowMeta<TRow> = {
  rowLabel?: (row: NodeGridRow<TRow>) => string;
  /** `true` expanded, `false` collapsed, `undefined` not expandable. */
  rowExpansion?: (row: NodeGridRow<TRow>) => boolean | undefined;
};

function isOutlineNode(node: unknown): node is OutlineNode {
  return typeof node === "object" && node !== null && "type" in node && "name" in node;
}

/**
 * Falling back to the outline's own labelling keeps the tree tabs from having to pass these;
 * a tab with a different row type supplies its own. Shared by the desktop row and the compact
 * one so the two cannot describe the same row differently.
 */
function rowLabelFor<TRow>(
  row: NodeGridRow<TRow>,
  rowLabel: RowMeta<TRow>["rowLabel"],
): string | undefined {
  if (rowLabel) return rowLabel(row);
  const node = row.node;
  return isOutlineNode(node)
    ? `${TYPE_LABELS[node.type]}: ${node.name || "Untitled"}`
    : undefined;
}

function rowExpansionFor<TRow>(
  row: NodeGridRow<TRow>,
  rowExpansion: RowMeta<TRow>["rowExpansion"],
): boolean | undefined {
  if (rowExpansion) return rowExpansion(row);
  const node = row.node;
  if (!isOutlineNode(node)) return undefined;
  return node.hasChildren ? !node.collapsed : undefined;
}

/**
 * Shared data grid: column-driven layout, optional sort and per-column filters, group
 * header rows, selection highlighting. Tree commands and optimistic patching stay in the
 * host tab — this component only renders a prepared `GridRow[]` against `ColumnDef[]`.
 *
 * The row payload is a type parameter defaulting to `OutlineNode`, so the Notes tab — whose
 * rows are notes, not nodes — reuses this grid instead of hand-rolling a second one the way
 * Wish List had to.
 */
export function DataGrid<TCtx, TRow = OutlineNode>({
  rows,
  columns,
  columnCtx,
  selectedId,
  onSelect,
  onOpenDetail,
  ariaLabel,
  empty,
  enableFilters = false,
  enableSort = false,
  sort: controlledSort,
  onSortChange,
  filters: controlledFilters,
  onFilterChange,
  widths,
  onResizeColumn,
  onResetColumnWidth,
  collapsedGroups,
  onToggleGroup,
  rowDrag,
  rowMenu,
  rowLabel,
  rowExpansion,
}: {
  rows: GridRow<TRow>[];
  columns: ColumnDef<TCtx, TRow>[];
  columnCtx: TCtx;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenDetail?: (id: string) => void;
  ariaLabel: string;
  empty?: ReactNode;
  enableFilters?: boolean;
  enableSort?: boolean;
  /**
   * Sort and filters are controlled when a host passes them, which is what lets a tab
   * persist them. Omitting both keeps the grid's own state, so a tab can adopt one at a
   * time — and so a grid with nothing to remember does not need a store.
   */
  sort?: SortState;
  onSortChange?: (columnId: string) => void;
  filters?: Record<string, ColumnFilter>;
  onFilterChange?: (columnId: string, filter: ColumnFilter) => void;
  /** Column id to pixel width, overriding each column's declared track. */
  widths?: Record<string, number>;
  /** Omit to leave columns unresizable, as a grid with nowhere to store widths should. */
  onResizeColumn?: (columnId: string, width: number) => void;
  onResetColumnWidth?: (columnId: string) => void;
  /** Group ids the user has collapsed. Omitted means every group is open. */
  collapsedGroups?: Set<string>;
  onToggleGroup?: (groupId: string) => void;
  /** Omit to leave rows undraggable, as every tab but the outline does. */
  rowDrag?: RowDrag;
  /**
   * Right-click menu for a row. Omit to leave the browser's own menu alone. Called each
   * time the menu opens rather than memoised, so item state is never stale.
   */
  rowMenu?: (nodeId: string) => MenuItem[];
} & RowMeta<TRow>) {
  type Row = NodeGridRow<TRow>;

  const [ownSort, setOwnSort] = useState<SortState>(null);
  const [ownFilters, setOwnFilters] = useState<Record<string, ColumnFilter>>({});
  const sort = controlledSort !== undefined ? controlledSort : ownSort;
  const filters = controlledFilters ?? ownFilters;

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [menu, setMenu] = useState<{ rowId: string; x: number; y: number } | null>(
    null,
  );
  const closeMenu = useCallback(() => setMenu(null), []);
  const gridRef = useRef<HTMLDivElement>(null);
  const gridTemplate = buildGridTemplate(columns, widths);

  const compact = useIsCompact();

  /**
   * Which columns survive to a phone row. Filtered to the ones that can actually produce
   * compact text before the meta cap applies, so a column with nothing to show does not
   * spend one of the three slots on a blank chip.
   */
  const compactFields = useMemo(
    () =>
      resolveCompactFields(
        columns.filter(
          (column) =>
            column.compact !== undefined ||
            column.compactText !== undefined ||
            column.filterValue !== undefined,
        ),
      ),
    [columns],
  );

  const kinds = useMemo(() => {
    const map: Record<string, ColumnDef<TCtx, TRow>["filterKind"]> = {};
    for (const column of columns) map[column.id] = column.filterKind;
    return map;
  }, [columns]);

  const nodeRows = useMemo(
    () => rows.filter((row): row is Row => row.kind === "node"),
    [rows],
  );

  const distinctValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const column of columns) {
      if (!column.filterValue) continue;
      const seen = new Set<string>();
      for (const row of nodeRows) {
        const value = column.filterValue(row);
        if (value !== null && value !== "") seen.add(value);
      }
      map[column.id] = Array.from(seen);
    }
    return map;
  }, [columns, nodeRows]);

  const today =
    typeof columnCtx === "object" &&
    columnCtx !== null &&
    "today" in columnCtx &&
    typeof (columnCtx as { today: unknown }).today === "string"
      ? (columnCtx as { today: string }).today
      : typeof columnCtx === "object" && columnCtx !== null && "today" in columnCtx
        ? ((columnCtx as { today: string | null }).today ?? null)
        : null;

  const anyFilterActive = useMemo(
    () => Object.values(filters).some(filterActive),
    [filters],
  );

  const displayRows = useMemo(() => {
    let next = rows;

    if (anyFilterActive) {
      // Filter node rows; drop group headers whose section ends up empty.
      const passIds = new Set<string>();
      for (const row of nodeRows) {
        const values: Record<string, string | null> = {};
        for (const column of columns) {
          if (column.filterValue) values[column.id] = column.filterValue(row);
        }
        if (rowPassesFilters(values, filters, kinds, today)) passIds.add(row.id);
      }

      next = dropEmptyGroups(
        next.filter((row) => row.kind !== "node" || passIds.has(row.id)),
        passIds,
      );
    }

    if (collapsedGroups && collapsedGroups.size > 0) {
      next = applyGroupCollapse(next, collapsedGroups);
    }

    if (sort) {
      const column = columns.find((entry) => entry.id === sort.columnId);
      // Sorting happens within each group segment, so a grouped tab reorders its rows
      // rather than silently ignoring the click. See `@/lib/grid/sortRows`.
      if (column?.sortValue) {
        const sortValue = column.sortValue;
        next = sortRowsWithinGroups(next, (row) => sortValue(row), sort.direction);
      }
    }

    return next;
  }, [
    rows,
    nodeRows,
    columns,
    filters,
    anyFilterActive,
    kinds,
    today,
    sort,
    collapsedGroups,
  ]);

  const handleSort = useCallback(
    (columnId: string) => {
      if (onSortChange) {
        onSortChange(columnId);
        return;
      }
      // Achieve's header cycle: unsorted -> ascending -> descending -> unsorted.
      setOwnSort((current) => {
        if (!current || current.columnId !== columnId) {
          return { columnId, direction: "asc" };
        }
        if (current.direction === "asc") return { columnId, direction: "desc" };
        return null;
      });
    },
    [onSortChange],
  );

  const handleFilterChange = useCallback(
    (columnId: string, filter: ColumnFilter) => {
      if (onFilterChange) {
        onFilterChange(columnId, filter);
        return;
      }
      setOwnFilters((current) => ({ ...current, [columnId]: filter }));
    },
    [onFilterChange],
  );

  function endDrag() {
    setDragId(null);
    setDropHint(null);
  }

  /** One row's share of the drag, or nothing when the tab left drag turned off. */
  function dragBindingFor(rowId: string): RowDragBinding | undefined {
    if (!rowDrag) return undefined;
    // Drag is off below `md`, deliberately. `draggable` is armed on `onMouseDown` so a
    // permanently draggable row does not steal text selection inside cell editors, and
    // `onMouseDown` does not reliably precede a touch drag — the mechanism is mouse-shaped
    // by construction. Reordering lives in the long-press menu instead (`responsive.md`).
    if (compact) return undefined;

    const forget = () =>
      setDropHint((current) => (current?.targetId === rowId ? null : current));

    return {
      dragging: dragId === rowId,
      hint:
        dropHint?.targetId === rowId
          ? { zone: dropHint.zone, depth: dropHint.depth }
          : null,
      onStart: () => {
        setDragId(rowId);
        onSelect(rowId);
      },
      onOver: (zone) => {
        if (!dragId) return false;
        const resolved = rowDrag.resolve(dragId, rowId, zone);
        if (!resolved) {
          forget();
          return false;
        }
        // Re-using the current object when nothing moved keeps a 60 Hz stream of dragover
        // events from re-rendering the whole grid.
        setDropHint((current) =>
          current?.targetId === rowId &&
          current.zone === zone &&
          current.depth === resolved.depth
            ? current
            : { targetId: rowId, zone, depth: resolved.depth },
        );
        return true;
      },
      onLeave: forget,
      onDrop: (zone) => {
        const id = dragId;
        endDrag();
        if (id) rowDrag.onDrop(id, rowId, zone);
      },
      onEnd: endDrag,
    };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No column header on a phone: there are no columns to head, and sort, filter and
          resize are all mouse-shaped controls at 10px. Sorting stays reachable from the
          view's own toolbar. */}
      {!compact && (
        <ColumnHeaderRow
          columns={columns}
          gridTemplate={gridTemplate}
          sort={enableSort ? sort : null}
          onSort={enableSort ? handleSort : undefined}
          filters={filters}
          onFilterChange={handleFilterChange}
          distinctValues={distinctValues}
          onResize={onResizeColumn}
          onResetWidth={onResetColumnWidth}
          enableFilters={enableFilters}
        />
      )}

      <div
        ref={gridRef}
        tabIndex={0}
        role="treegrid"
        aria-label={ariaLabel}
        className="min-h-0 flex-1 overflow-auto outline-none"
      >
        {displayRows.length === 0
          ? (empty ?? (
              <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
                Nothing to show.
              </div>
            ))
          : displayRows.map((row) =>
              row.kind === "group" ? (
                <GroupHeader
                  key={row.id}
                  row={row}
                  gridTemplate={gridTemplate}
                  columnCount={columns.length}
                  collapsed={collapsedGroups?.has(row.id) ?? false}
                  onToggle={() => onToggleGroup?.(row.id)}
                  // Groups are drop targets only (never dragged). Outline category headers
                  // use this so a root result area can change category by landing on a group.
                  drag={dragBindingFor(row.id)}
                  compact={compact}
                />
              ) : compact ? (
                <CompactRow
                  key={row.id}
                  row={row}
                  columnCtx={columnCtx}
                  fields={compactFields}
                  selected={row.id === selectedId}
                  onSelect={() => onSelect(row.id)}
                  onOpenDetail={onOpenDetail ? () => onOpenDetail(row.id) : undefined}
                  onLongPress={
                    rowMenu &&
                    ((x, y) => {
                      onSelect(row.id);
                      setMenu({ rowId: row.id, x, y });
                    })
                  }
                  label={rowLabelFor(row, rowLabel)}
                  expanded={rowExpansionFor(row, rowExpansion)}
                />
              ) : (
                <DataRow
                  key={row.id}
                  row={row}
                  columns={columns}
                  columnCtx={columnCtx}
                  gridTemplate={gridTemplate}
                  selected={row.id === selectedId}
                  onSelect={() => onSelect(row.id)}
                  onOpenDetail={onOpenDetail ? () => onOpenDetail(row.id) : undefined}
                  drag={dragBindingFor(row.id)}
                  onContextMenu={
                    rowMenu &&
                    ((x, y) => {
                      onSelect(row.id);
                      setMenu({ rowId: row.id, x, y });
                    })
                  }
                  rowLabel={rowLabel}
                  rowExpansion={rowExpansion}
                />
              ),
            )}
      </div>

      {menu && rowMenu && (
        // Built on open rather than held in state, so an item's enabled/disabled state
        // reflects the tree as it is now.
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={rowMenu(menu.rowId)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

function DataRow<TCtx, TRow>({
  row,
  columns,
  columnCtx,
  gridTemplate,
  selected,
  onSelect,
  onOpenDetail,
  drag,
  onContextMenu,
  rowLabel,
  rowExpansion,
}: {
  row: NodeGridRow<TRow>;
  columns: ColumnDef<TCtx, TRow>[];
  columnCtx: TCtx;
  gridTemplate: string;
  selected: boolean;
  onSelect: () => void;
  onOpenDetail?: () => void;
  drag?: RowDragBinding;
  onContextMenu?: (x: number, y: number) => void;
} & RowMeta<TRow>) {
  const rowRef = useRef<HTMLDivElement>(null);
  // `draggable` is armed on mousedown rather than left on: a permanently draggable row
  // steals the click-and-drag that selects text inside the priority, effort and deadline
  // inputs sitting in every row.
  const [armed, setArmed] = useState(false);

  const label = rowLabelFor(row, rowLabel);
  const expanded = rowExpansionFor(row, rowExpansion);

  useEffect(() => {
    if (selected) {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  return (
    <div
      ref={rowRef}
      role="row"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={expanded}
      aria-label={label}
      onClick={onSelect}
      onDoubleClick={onOpenDetail}
      onContextMenu={
        onContextMenu &&
        ((event) => {
          // Inside a cell's editor the browser's own cut/copy/paste menu is the useful one.
          if ((event.target as HTMLElement).closest("input, select, textarea")) return;
          event.preventDefault();
          onContextMenu(event.clientX, event.clientY);
        })
      }
      draggable={drag ? armed : undefined}
      onMouseDown={
        drag &&
        ((event) => {
          const target = event.target as HTMLElement;
          setArmed(!target.closest("input, select, textarea, button"));
        })
      }
      onDragStart={
        drag &&
        ((event) => {
          // Some drop targets ignore a drag carrying no data at all.
          event.dataTransfer.setData("text/plain", row.id);
          event.dataTransfer.effectAllowed = "move";
          drag.onStart();
        })
      }
      onDragOver={
        drag &&
        ((event) => {
          if (!drag.onOver(dropZoneFor(event))) return;
          // Only an accepted hover is prevented — refusing lets the browser show the
          // no-drop cursor and stops the drop event from firing at all.
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        })
      }
      onDragLeave={drag && (() => drag.onLeave())}
      onDrop={
        drag &&
        ((event) => {
          event.preventDefault();
          drag.onDrop(dropZoneFor(event));
          setArmed(false);
        })
      }
      onDragEnd={
        drag &&
        (() => {
          drag.onEnd();
          setArmed(false);
        })
      }
      className={[
        "relative grid items-center border-b border-rule/60 px-3 text-[0.875rem]",
        selected ? "bg-select" : "hover:bg-surface-raised/60",
        drag?.dragging ? "opacity-40" : "",
        drag?.hint?.zone === "inside" ? "ring-1 ring-select-edge ring-inset" : "",
      ].join(" ")}
      style={{
        gridTemplateColumns: gridTemplate,
        columnGap: "0.75rem",
        height: "var(--row-height)",
      }}
    >
      {columns.map((column) => (
        <div
          key={column.id}
          role="gridcell"
          className={`flex min-w-0 items-center self-stretch ${alignClass(column.align)}`}
        >
          {column.render(row, columnCtx)}
        </div>
      ))}

      {drag?.hint && drag.hint.zone !== "inside" && (
        <DropLine
          zone={drag.hint.zone}
          depth={drag.hint.depth}
          nameColumnLeft={nameColumnLeft(columns)}
        />
      )}
    </div>
  );
}

/** Which third of a row the pointer is over. */
function dropZoneFor(event: React.DragEvent<HTMLDivElement>): DropZone {
  const rect = event.currentTarget.getBoundingClientRect();
  const offset = (event.clientY - rect.top) / rect.height;
  if (offset < 0.33) return "before";
  if (offset > 0.67) return "after";
  return "inside";
}

/**
 * The insertion line, indented to the depth the node will land at rather than to the depth
 * of the row under the cursor — so a drop that snaps out to an ancestor's level says so
 * before the mouse is released.
 */
function DropLine({
  zone,
  depth,
  nameColumnLeft,
}: {
  zone: "before" | "after";
  depth: number;
  nameColumnLeft: string;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-0 z-10 h-0.5 bg-select-edge"
      style={{
        left: `calc(${nameColumnLeft} + ${depth} * var(--indent-step))`,
        top: zone === "before" ? "-1px" : undefined,
        bottom: zone === "after" ? "-1px" : undefined,
      }}
    />
  );
}

/**
 * Where the name column starts, as a CSS length: the row's own padding plus every fixed
 * track before it (priority, and whatever a tab puts ahead of the tree). Indentation lives
 * in the name cell, so the drop line has to start there too. Any non-fixed track before
 * the name — none today — gives up and measures from the row edge.
 */
function nameColumnLeft(columns: { id: string; width: string }[]): string {
  const parts = ["0.75rem"];
  for (const column of columns) {
    if (column.id === "name") break;
    if (!/^[\d.]+(rem|px|em)$/.test(column.width)) return "0.75rem";
    parts.push(column.width, "0.75rem");
  }
  return `calc(${parts.join(" + ")})`;
}

function GroupHeader({
  row,
  gridTemplate,
  columnCount,
  collapsed,
  onToggle,
  drag,
  compact,
}: {
  row: Extract<GridRow, { kind: "group" }>;
  gridTemplate: string;
  columnCount: number;
  collapsed: boolean;
  onToggle: () => void;
  /** Drop target only — group headers are never themselves dragged. */
  drag?: RowDragBinding;
  compact: boolean;
}) {
  return (
    <div
      role="row"
      aria-expanded={!collapsed}
      onClick={onToggle}
      onDragOver={
        drag &&
        ((event) => {
          // Treat the whole header as "inside" the group — no before/after line on a bar.
          if (!drag.onOver("inside")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        })
      }
      onDragLeave={drag && (() => drag.onLeave())}
      onDrop={
        drag &&
        ((event) => {
          event.preventDefault();
          drag.onDrop("inside");
        })
      }
      className={[
        "grid cursor-pointer items-center border-b border-rule bg-surface-raised/80 px-3 text-[0.8125rem] font-semibold text-ink hover:bg-surface-raised",
        // A compact header is a sticky section label, not a row in a template: it keeps its
        // place while the list under it scrolls, and it is tall enough to tap.
        compact ? "sticky top-0 z-10 min-h-9 py-1.5 text-[0.8125rem]" : "",
        drag?.hint ? "ring-1 ring-select-edge ring-inset" : "",
      ].join(" ")}
      style={
        compact
          ? undefined
          : {
              gridTemplateColumns: gridTemplate,
              columnGap: "0.75rem",
              height: "var(--row-height)",
            }
      }
    >
      <div
        className="flex min-w-0 items-center gap-1.5"
        style={compact ? undefined : { gridColumn: `1 / span ${columnCount}` }}
      >
        <span
          className="text-[0.625rem] text-ink-faint"
          style={{ marginLeft: `${row.depth * 0.75}rem` }}
        >
          {collapsed ? "▶" : "▼"}
        </span>
        <span className="truncate">{row.label}</span>
        <span className="tabular text-[0.75rem] font-normal text-ink-faint">
          ({row.count})
        </span>
      </div>
    </div>
  );
}

function dropEmptyGroups<TRow>(
  rows: GridRow<TRow>[],
  passIds: Set<string>,
): GridRow<TRow>[] {
  // Walk bottom-up: a group stays if any subsequent node before the next same-or-shallower
  // group is still present.
  const out: GridRow<TRow>[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind === "node") {
      if (passIds.has(row.id)) out.push(row);
      continue;
    }
    let hasChild = false;
    for (let j = i + 1; j < rows.length; j++) {
      const next = rows[j];
      if (next.kind === "group" && next.depth <= row.depth) break;
      if (next.kind === "node" && passIds.has(next.id)) {
        hasChild = true;
        break;
      }
    }
    if (hasChild) out.push(row);
  }
  return out;
}

function applyGroupCollapse<TRow>(
  rows: GridRow<TRow>[],
  collapsed: Set<string>,
): GridRow<TRow>[] {
  const out: GridRow<TRow>[] = [];
  let hideUntilDepth: number | null = null;

  for (const row of rows) {
    if (hideUntilDepth !== null) {
      if (row.kind === "group" && row.depth <= hideUntilDepth) {
        hideUntilDepth = null;
      } else if (
        row.kind === "node" ||
        (row.kind === "group" && row.depth > hideUntilDepth)
      ) {
        continue;
      }
    }

    out.push(row);
    if (row.kind === "group" && collapsed.has(row.id)) {
      hideUntilDepth = row.depth;
    }
  }
  return out;
}

export { ALL_FILTER };
