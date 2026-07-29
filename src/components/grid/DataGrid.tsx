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
import { ALL_FILTER, rowPassesFilters, type ColumnFilter } from "./filters";

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

  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [menu, setMenu] = useState<{ rowId: string; x: number; y: number } | null>(
    null,
  );
  const closeMenu = useCallback(() => setMenu(null), []);
  const gridRef = useRef<HTMLDivElement>(null);
  const gridTemplate = buildGridTemplate(columns);

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

  const filteredRows = useMemo(() => {
    const active = Object.values(filters).some((filter) => filter.id !== "all");
    if (!active && !sort) return rows;

    // Filter node rows; drop group headers whose section ends up empty.
    const passIds = new Set<string>();
    for (const row of nodeRows) {
      const values: Record<string, string | null> = {};
      for (const column of columns) {
        if (column.filterValue) values[column.id] = column.filterValue(row);
      }
      if (rowPassesFilters(values, filters, kinds, today)) {
        passIds.add(row.id);
      }
    }

    let next = rows.filter((row) => {
      if (row.kind === "node") return passIds.has(row.id);
      return true;
    });

    // Collapse groups whose filtered children are all gone.
    next = dropEmptyGroups(next, passIds);

    if (collapsedGroups && collapsedGroups.size > 0) {
      next = applyGroupCollapse(next, collapsedGroups);
    }

    if (sort) {
      const column = columns.find((entry) => entry.id === sort.columnId);
      if (column?.sortValue) {
        const direction = sort.direction === "asc" ? 1 : -1;
        const nodes = next.filter((row): row is Row => row.kind === "node");
        const groups = next.filter((row) => row.kind === "group");
        // Sorting flattens group structure for the outline (no groups) and for simple
        // lists; grouped tabs should sort within groups. Keep nodes in group order by
        // sorting only when there are no group headers.
        if (groups.length === 0) {
          nodes.sort(
            (a, b) =>
              compareSort(column.sortValue!(a), column.sortValue!(b)) * direction,
          );
          next = nodes;
        }
      }
    }

    return next;
  }, [rows, nodeRows, columns, filters, kinds, today, sort, collapsedGroups]);

  // When filters/sort are off, still honour group collapse.
  const displayRows = useMemo(() => {
    if (Object.values(filters).some((filter) => filter.id !== "all") || sort) {
      return filteredRows;
    }
    if (collapsedGroups && collapsedGroups.size > 0) {
      return applyGroupCollapse(rows, collapsedGroups);
    }
    return rows;
  }, [rows, filteredRows, filters, sort, collapsedGroups]);

  function handleSort(columnId: string) {
    setSort((current) => {
      if (!current || current.columnId !== columnId) {
        return { columnId, direction: "asc" };
      }
      if (current.direction === "asc") return { columnId, direction: "desc" };
      return null;
    });
  }

  function endDrag() {
    setDragId(null);
    setDropHint(null);
  }

  /** One row's share of the drag, or nothing when the tab left drag turned off. */
  function dragBindingFor(rowId: string): RowDragBinding | undefined {
    if (!rowDrag) return undefined;

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
      <ColumnHeaderRow
        columns={columns}
        gridTemplate={gridTemplate}
        sort={enableSort ? sort : null}
        onSort={enableSort ? handleSort : undefined}
        filters={filters}
        onFilterChange={(columnId, filter) =>
          setFilters((current) => ({ ...current, [columnId]: filter }))
        }
        distinctValues={distinctValues}
        enableFilters={enableFilters}
      />

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
  const node = row.node;

  // Falling back to the outline's own labelling keeps the tree tabs from having to pass
  // these; a tab with a different row type supplies its own.
  const label = rowLabel
    ? rowLabel(row)
    : isOutlineNode(node)
      ? `${TYPE_LABELS[node.type]}: ${node.name || "Untitled"}`
      : undefined;

  const expanded = rowExpansion
    ? rowExpansion(row)
    : isOutlineNode(node)
      ? node.hasChildren
        ? !node.collapsed
        : undefined
      : undefined;

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
}: {
  row: Extract<GridRow, { kind: "group" }>;
  gridTemplate: string;
  columnCount: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="row"
      aria-expanded={!collapsed}
      onClick={onToggle}
      className="grid cursor-pointer items-center border-b border-rule bg-surface-raised/80 px-3 text-[0.8125rem] font-semibold text-ink hover:bg-surface-raised"
      style={{
        gridTemplateColumns: gridTemplate,
        columnGap: "0.75rem",
        height: "var(--row-height)",
      }}
    >
      <div
        className="flex min-w-0 items-center gap-1.5"
        style={{ gridColumn: `1 / span ${columnCount}` }}
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

function compareSort(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Depth in the whole tree, keyed by node id, for the name cell's indent rails. Walked from
 * each node rather than read off `GridRow.depth`, because the tabs that group and filter
 * rows still want a row indented to where it sits in the outline.
 */
export function buildNodeDepths(
  nodes: { id: string; parentId: string | null }[],
  byId: Map<string, { parentId: string | null }>,
): Map<string, number> {
  const depths = new Map<string, number>();
  for (const node of nodes) {
    let depth = 0;
    let current = node.parentId;
    while (current) {
      const parent = byId.get(current);
      if (!parent) break;
      depth += 1;
      current = parent.parentId;
    }
    depths.set(node.id, depth);
  }
  return depths;
}

export { ALL_FILTER };
