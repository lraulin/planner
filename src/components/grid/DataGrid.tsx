"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PriorityLetter } from "@/db/schema";
import type { GridRow } from "@/lib/tree/slice";
import { TYPE_LABELS } from "@/lib/tree/hierarchy";
import {
  alignClass,
  buildGridTemplate,
  type ColumnDef,
  type NodeGridRow,
} from "./columns";
import { ColumnHeaderRow } from "./ColumnHeader";
import { ALL_FILTER, rowPassesFilters, type ColumnFilter } from "./filters";

export type SortState = { columnId: string; direction: "asc" | "desc" } | null;

/**
 * Shared data grid: column-driven layout, optional sort and per-column filters, group
 * header rows, selection highlighting. Tree commands and optimistic patching stay in the
 * host tab — this component only renders a prepared `GridRow[]` against `ColumnDef[]`.
 */
export function DataGrid<TCtx>({
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
}: {
  rows: GridRow[];
  columns: ColumnDef<TCtx>[];
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
}) {
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const gridTemplate = buildGridTemplate(columns);

  const kinds = useMemo(() => {
    const map: Record<string, ColumnDef<TCtx>["filterKind"]> = {};
    for (const column of columns) map[column.id] = column.filterKind;
    return map;
  }, [columns]);

  const nodeRows = useMemo(
    () => rows.filter((row): row is NodeGridRow => row.kind === "node"),
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
        const nodes = next.filter((row): row is NodeGridRow => row.kind === "node");
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
                />
              ),
            )}
      </div>
    </div>
  );
}

function DataRow<TCtx>({
  row,
  columns,
  columnCtx,
  gridTemplate,
  selected,
  onSelect,
  onOpenDetail,
}: {
  row: NodeGridRow;
  columns: ColumnDef<TCtx>[];
  columnCtx: TCtx;
  gridTemplate: string;
  selected: boolean;
  onSelect: () => void;
  onOpenDetail?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const node = row.node;

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
      aria-expanded={node.hasChildren ? !node.collapsed : undefined}
      aria-label={`${TYPE_LABELS[node.type]}: ${node.name || "Untitled"}`}
      onClick={onSelect}
      onDoubleClick={onOpenDetail}
      className={[
        "grid items-center border-b border-rule/60 px-3 text-[0.875rem]",
        selected ? "bg-select" : "hover:bg-surface-raised/60",
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
    </div>
  );
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

function dropEmptyGroups(rows: GridRow[], passIds: Set<string>): GridRow[] {
  // Walk bottom-up: a group stays if any subsequent node before the next same-or-shallower
  // group is still present.
  const out: GridRow[] = [];
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

function applyGroupCollapse(rows: GridRow[], collapsed: Set<string>): GridRow[] {
  const out: GridRow[] = [];
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

/** Build ancestor priority chains for the name-cell spine. */
export function buildAncestorPriorities(
  nodes: {
    id: string;
    parentId: string | null;
    priorityLetter: PriorityLetter | null;
  }[],
  byId: Map<string, { parentId: string | null; priorityLetter: PriorityLetter | null }>,
): Map<string, (PriorityLetter | null)[]> {
  const chains = new Map<string, (PriorityLetter | null)[]>();
  for (const node of nodes) {
    const chain: (PriorityLetter | null)[] = [];
    let current = node.parentId;
    while (current) {
      const parent = byId.get(current);
      if (!parent) break;
      chain.unshift(parent.priorityLetter);
      current = parent.parentId;
    }
    chains.set(node.id, chain);
  }
  return chains;
}

export { ALL_FILTER };
