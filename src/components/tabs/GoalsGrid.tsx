"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { asGroupBy, sliceTree, type GridRow, type GroupBy } from "@/lib/tree/slice";
import { formatPriority } from "@/lib/tree/format";
import { toDateKey } from "@/lib/schedule/geometry";
import { STATE_LABELS } from "@/lib/tree/hierarchy";
import type { ColumnDef } from "@/components/grid/columns";
import { CascadeConfirm } from "@/components/grid/CascadeConfirm";
import { DataGrid } from "@/components/grid/DataGrid";
import {
  useGridState,
  useIncludeDeferred,
  useTabView,
  type GridDefaults,
} from "@/components/grid/useGridState";
import { openStateFilters, settledStateFilters } from "@/lib/grid/stateFilters";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import {
  categoryColumn,
  typeColumn,
  dateCompletedColumn,
  purposeColumn,
} from "@/components/grid/commonColumns";
import {
  DeadlineCell,
  NameCell,
  PriorityCell,
  StateCell,
  TextCell,
} from "@/components/grid/cells";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { setGoalFieldAction } from "@/app/outline/detail-actions";
import { ToolbarSelect, ToolbarToggle } from "./tabChrome";
import { useGridTab } from "./useGridTab";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";

const VIEW_IDS = ["all", "active", "completed"] as const;

type ViewId = (typeof VIEW_IDS)[number];

/**
 * Views as collections of settings — see the note on Tasks. Goals' default order carries the
 * **wide** State column, which filters on full labels rather than Achieve's codes.
 */
const VIEWS: { id: ViewId; label: string; filters?: GridDefaults["filters"] }[] = [
  { id: "all", label: "All Goals" },
  { id: "active", label: "Active Goals", filters: openStateFilters("state", "label") },
  {
    id: "completed",
    label: "Completed Goals",
    filters: settledStateFilters("state", "label"),
  },
];

const DEFAULT_ORDER = ["priority", "name", "definition", "state", "deadline", "range"];

type GoalsCtx = OutlineColumnCtx & {
  onDefinitionChange: (node: OutlineNode, value: string) => void;
  onRangeChange: (node: OutlineNode, value: string) => void;
};

function buildColumns(): ColumnDef<GoalsCtx>[] {
  return [
    categoryColumn(),
    typeColumn(),
    {
      id: "priority",
      label: "Pri",
      width: "3rem",
      align: "center",
      filterKind: "priority",
      filterValue: (row) =>
        formatPriority(row.node.priorityLetter, row.node.priorityRank) || null,
      sortValue: (row) =>
        formatPriority(row.node.priorityLetter, row.node.priorityRank),
      render: (row, ctx) => (
        <PriorityCell
          key={`priority:${formatPriority(row.node.priorityLetter, row.node.priorityRank)}`}
          node={row.node}
          onChange={(letter, rank) => ctx.onPriorityChange(row.node, letter, rank)}
        />
      ),
    },
    {
      id: "name",
      label: "Title",
      width: "minmax(12rem,1fr)",
      hideable: false,
      filterKind: "text",
      filterValue: (row) => row.node.name,
      sortValue: (row) => row.node.name.toLowerCase(),
      render: (row, ctx) => (
        <NameCell
          node={row.node}
          depth={row.node.depth}
          selected={row.node.id === ctx.selectedId}
          editing={row.node.id === ctx.editingId}
          onToggleCollapsed={() => ctx.onToggleCollapsed(row.node)}
          onOpenDetail={() => ctx.onOpenDetail(row.node)}
          onFinishEdit={(name) => ctx.onFinishEdit(row.node, name)}
          onCancelEdit={ctx.onCancelEdit}
        />
      ),
    },
    {
      id: "definition",
      label: "Definition",
      width: "minmax(12rem,1.2fr)",
      filterKind: "text",
      filterValue: (row) => row.node.definition || null,
      render: (row, ctx) => (
        <TextCell
          key={`def:${row.node.definition}`}
          value={row.node.definition}
          ariaLabel="Definition"
          onChange={(value) => ctx.onDefinitionChange(row.node, value)}
        />
      ),
    },
    {
      id: "state",
      label: "Status",
      width: "7rem",
      filterKind: "enum",
      // Goals tab: Status is nodes.state spelled out, not the derived schedule status.
      filterValue: (row) => STATE_LABELS[row.node.state],
      sortValue: (row) => row.node.state,
      render: (row, ctx) => (
        <StateCell
          node={row.node}
          onChange={(state) => ctx.onStateChange(row.node, state)}
        />
      ),
    },
    {
      id: "deadline",
      label: "Deadline",
      width: "7rem",
      align: "right",
      filterKind: "date",
      filterValue: (row) => (row.node.deadline ? toDateKey(row.node.deadline) : null),
      sortValue: (row) => (row.node.deadline ? toDateKey(row.node.deadline) : null),
      render: (row, ctx) => (
        <DeadlineCell
          node={row.node}
          today={ctx.today}
          onChange={(deadline) => ctx.onDeadlineChange(row.node, deadline)}
        />
      ),
    },
    {
      id: "range",
      label: "Range",
      width: "6rem",
      filterKind: "enum",
      filterValue: (row) => row.node.range || null,
      render: (row, ctx) => (
        <TextCell
          key={`range:${row.node.range}`}
          value={row.node.range}
          ariaLabel="Range"
          onChange={(value) => ctx.onRangeChange(row.node, value)}
        />
      ),
    },
    // Optional AP fields — available via Show Fields; not in DEFAULT_ORDER.
    dateCompletedColumn(),
    purposeColumn(),
  ];
}

/** A goal has no project or deadline band worth grouping under; these are what remain. */
const GOAL_GROUP_DIMENSIONS: GroupBy[] = [
  "resultArea",
  "category",
  "state",
  "priorityLetter",
];

export function GoalsGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const tab = useGridTab(initialNodes);
  const [view, setView] = useTabView("goals", VIEW_IDS, "all");
  const [scopeId, setScopeId] = useState<string>("");
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<string[]>([]);

  const resultAreas = useMemo(
    () => tab.nodes.filter((n) => n.type === "result_area"),
    [tab.nodes],
  );

  const allColumns = useMemo(() => buildColumns(), []);
  const gridState = useGridState(`goals.${view}`, allColumns, DEFAULT_ORDER, {
    filters: VIEWS.find((entry) => entry.id === view)?.filters,
  });
  const [includeDeferred, setIncludeDeferred] = useIncludeDeferred("goals");

  const rows: GridRow[] = useMemo(
    () =>
      sliceTree(tab.nodes, {
        // Structural only — which states a view shows is its default State filter.
        keep: (node) => node.type === "goal",
        // Result Area is the arrangement Achieve ships; Group by overrides it on request.
        groupBy: (() => {
          const chosen = asGroupBy(gridState.groupBy);
          return chosen.length > 0 ? chosen : (["resultArea"] as GroupBy[]);
        })(),
        scopeId: scopeId || null,
        includeDeferred,
        today: tab.today,
      }),
    [tab.nodes, tab.today, scopeId, gridState.groupBy, includeDeferred],
  );

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        allColumns,
        rows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [allColumns, rows],
  );

  const navigableIds = useMemo(
    () => rows.flatMap((row) => (row.kind === "node" ? [row.id] : [])),
    [rows],
  );
  const navigableKey = navigableIds.join("\0");
  const [seenNavigable, setSeenNavigable] = useState(navigableKey);
  if (navigableKey !== seenNavigable) {
    setSeenNavigable(navigableKey);
    tab.setNavigableIds(navigableIds);
  }

  const columnCtx: GoalsCtx = useMemo(
    () => ({
      ...tab.cellHandlers,
      onDefinitionChange: (node, value) => {
        tab.patch(node.id, { definition: value });
        tab.apply(() => setGoalFieldAction(node.id, "definition", value));
      },
      onRangeChange: (node, value) => {
        tab.patch(node.id, { range: value });
        tab.apply(() => setGoalFieldAction(node.id, "range", value));
      },
    }),
    [tab],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Goals"
        allColumns={allColumns}
        distinctValues={distinctValues}
        groupDimensions={GOAL_GROUP_DIMENSIONS}
        groupIds={groupIds}
        counts={counts}
        error={tab.error}
        left={
          <>
            <ToolbarSelect
              label="Result Area"
              value={scopeId}
              onChange={setScopeId}
              options={[
                { value: "", label: "All Result Areas" },
                ...resultAreas.map((area) => ({ value: area.id, label: area.name })),
              ]}
            />
            <ToolbarSelect
              label="View"
              value={view}
              onChange={(value) => setView(value as ViewId)}
              options={VIEWS.map((entry) => ({ value: entry.id, label: entry.label }))}
            />
            {/*
              Parity with Tasks and Projects. Goals used to hard-code `includeDeferred: true`,
              so a goal shelved until next quarter sat in the list with no way to put it away
              — the one node tab where shelving did nothing.
            */}
            <ToolbarToggle
              checked={includeDeferred}
              onChange={() => setIncludeDeferred(!includeDeferred)}
              label="Postponed"
            />
          </>
        }
        rowActions={{
          selectedId: tab.selectedId,
          onRename: tab.setEditingId,
          onOpen: tab.openDetail,
        }}
      />

      <DataGrid
        rows={rows}
        columns={gridState.columns}
        allColumns={allColumns}
        columnCtx={columnCtx}
        selectedId={tab.selectedId}
        selectedIds={tab.selectedIds}
        onSelect={tab.select}
        onOpenDetail={tab.openDetail}
        ariaLabel="Goals"
        rowNumbers
        rowMenu={tab.rowMenu}
        enableFilters
        enableSort
        sorts={gridState.sorts}
        onSortChange={gridState.toggleSort}
        onSetSort={gridState.setSort}
        filters={gridState.filters}
        onFilterChange={gridState.setFilter}
        advancedFilter={gridState.advancedFilter}
        search={gridState.search}
        distinctValues={distinctValues}
        onCountsChange={setCounts}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        columnControls={gridState.columnControls}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        onGroupIdsChange={setGroupIds}
        density={gridState.density}
        empty={
          <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
            No goals match this view.
          </div>
        }
      />

      <CascadeConfirm state={tab.stateChange} />

      <NodeDetailDrawer
        node={tab.detailNode}
        nodes={tab.nodes}
        onClose={() => tab.setDetailId(null)}
      />
    </div>
  );
}
