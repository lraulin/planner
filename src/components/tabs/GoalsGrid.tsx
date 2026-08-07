"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { asGroupBy, sliceTree, type GridRow, type GroupBy } from "@/lib/tree/slice";
import { formatPriority } from "@/lib/tree/format";
import { toDateKey } from "@/lib/schedule/geometry";
import type { ColumnDef } from "@/components/grid/columns";
import { CascadeConfirm } from "@/components/grid/CascadeConfirm";
import { DataGrid } from "@/components/grid/DataGrid";
import { useIncludeDeferred, type GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { openStateFilters, settledStateFilters } from "@/lib/grid/stateFilters";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import {
  categoryColumn,
  typeColumn,
  dateCompletedColumn,
  purposeColumn,
  stateColumn,
} from "@/components/grid/commonColumns";
import {
  DeadlineCell,
  NameCell,
  PriorityCell,
  TextCell,
} from "@/components/grid/cells";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { setGoalFieldAction } from "@/app/outline/detail-actions";
import { ToolbarSelect, ToolbarToggle } from "./tabChrome";
import { useGridTab } from "./useGridTab";
import { useNodeCommandDeck } from "@/components/grid/useNodeCommandDeck";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";

type ViewId = "all" | "active" | "completed";

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

/** Module scope so `useModuleViews` gets a stable identity, not a fresh closure per render. */
function viewDefaults(id: string): GridDefaults {
  return {
    order: DEFAULT_ORDER,
    filters: VIEWS.find((entry) => entry.id === id)?.filters,
  };
}

type GoalsCtx = OutlineColumnCtx & {
  onDefinitionChange: (node: OutlineNode, value: string) => void;
  onRangeChange: (node: OutlineNode, value: string) => void;
};

function buildColumns(today: string | null): ColumnDef<GoalsCtx>[] {
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
    // Goals tab: "Status" here is nodes.state spelled out, not the derived schedule
    // status. Only the heading differs from the shared column, so it borrows it rather
    // than keeping a second copy that has to be remembered whenever State changes.
    { ...stateColumn(today), label: "Status" },
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

/**
 * Both kinds, because this tab shows both — a Dream is a Goal you have not committed to a date
 * for, and it is filed here. Two kinds is also why the button stays `New` with the kinds behind
 * it: which one you meant is worth asking at the moment the row is made.
 *
 * Module scope so the identity is stable — see the note in `useNodeCommandDeck`.
 */
const GOAL_CREATE_KINDS = ["goal", "dream"] as const;

/** A goal has no project or deadline band worth grouping under; these are what remain. */
const GOAL_GROUP_DIMENSIONS: GroupBy[] = [
  "resultArea",
  "category",
  "state",
  "priorityLetter",
];

export function GoalsGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const tab = useGridTab(initialNodes);
  const nodeCommands = useNodeCommandDeck({
    nodes: tab.nodes,
    selectedId: tab.selectedId,
    selectedIds: tab.selectedIds,
    apply: tab.apply,
    create: {
      kinds: GOAL_CREATE_KINDS,
      // Narrowed to a Result Area, a new goal belongs to it.
      parentId: tab.scope ?? null,
      child: true,
      onCreated: tab.startNaming,
    },
    onOpen: tab.openDetail,
    onRename: tab.setEditingId,
    onCopyAsText: tab.copySelectionAsText,
    onStateChange: tab.cellHandlers.onStateChange,
  });
  // From `?scope=` rather than local state, so the narrowing survives reload and Back —
  // and so `View tasks…` from another module is a plain navigation into it.
  const scopeId = tab.scope ?? "";
  const setScopeId = tab.setScope;
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<string[]>([]);

  const resultAreas = useMemo(
    () => tab.nodes.filter((n) => n.type === "result_area"),
    [tab.nodes],
  );

  const allColumns = useMemo(() => buildColumns(tab.today), [tab.today]);
  const views = useModuleViews({
    moduleId: "goals",
    builtIn: VIEWS,
    defaultViewId: "all",
    columns: allColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;
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
        views={views}
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
        commandCapabilities={nodeCommands.capabilities}
      />

      {nodeCommands.dialogs}

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
        onNavigableIdsChange={tab.setNavigableIds}
        rowMenu={nodeCommands.rowMenu}
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
