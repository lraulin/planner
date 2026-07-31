"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { sliceTree, type GridRow } from "@/lib/tree/slice";
import { formatPriority } from "@/lib/tree/format";
import { STATE_LABELS } from "@/lib/tree/hierarchy";
import type { ColumnDef } from "@/components/grid/columns";
import { DataGrid } from "@/components/grid/DataGrid";
import { useGridState, useTabView } from "@/components/grid/useGridState";
import { ShowFieldsDialog } from "@/components/grid/ShowFieldsDialog";
import {
  DeadlineCell,
  NameCell,
  PriorityCell,
  StateCell,
  TextCell,
} from "@/components/grid/cells";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { setGoalFieldAction } from "@/app/outline/detail-actions";
import { ErrorBanner, TabToolbar, ToolbarButton, ToolbarSelect } from "./tabChrome";
import { useGridTab } from "./useGridTab";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";

const VIEW_IDS = ["all", "active", "completed"] as const;

type ViewId = (typeof VIEW_IDS)[number];

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "all", label: "All Goals" },
  { id: "active", label: "Active Goals" },
  { id: "completed", label: "Completed Goals" },
];

const DEFAULT_ORDER = ["priority", "name", "definition", "state", "deadline", "range"];

type GoalsCtx = OutlineColumnCtx & {
  onDefinitionChange: (node: OutlineNode, value: string) => void;
  onRangeChange: (node: OutlineNode, value: string) => void;
};

function isActive(node: OutlineNode): boolean {
  return node.state !== "completed" && node.state !== "cancelled";
}

function buildColumns(): ColumnDef<GoalsCtx>[] {
  return [
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
          depth={ctx.nodeDepths.get(row.node.id) ?? 0}
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
      filterValue: (row) =>
        row.node.deadline ? row.node.deadline.toISOString().slice(0, 10) : null,
      sortValue: (row) =>
        row.node.deadline ? row.node.deadline.toISOString().slice(0, 10) : null,
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
  ];
}

export function GoalsGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const tab = useGridTab(initialNodes);
  const [view, setView] = useTabView("goals", VIEW_IDS, "all");
  const [scopeId, setScopeId] = useState<string>("");
  const [showFields, setShowFields] = useState(false);

  const resultAreas = useMemo(
    () => tab.nodes.filter((n) => n.type === "result_area"),
    [tab.nodes],
  );

  const allColumns = useMemo(() => buildColumns(), []);
  const gridState = useGridState(`goals.${view}`, allColumns, DEFAULT_ORDER);

  const rows: GridRow[] = useMemo(
    () =>
      sliceTree(tab.nodes, {
        keep: (node) => {
          if (node.type !== "goal") return false;
          if (view === "completed") return node.state === "completed";
          if (view === "active") return isActive(node);
          return true;
        },
        groupBy: ["resultArea"],
        scopeId: scopeId || null,
        includeDeferred: true,
      }),
    [tab.nodes, view, scopeId],
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
      <TabToolbar>
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
        <ToolbarButton onClick={() => setShowFields(true)}>Show Fields</ToolbarButton>
        <ToolbarButton
          onClick={gridState.clearFilters}
          disabled={!gridState.filtersActive}
          title="Clear every column filter on this view"
        >
          Clear Filters
        </ToolbarButton>
        <ToolbarButton
          onClick={() => tab.selectedId && tab.setEditingId(tab.selectedId)}
          disabled={!tab.selectedId}
          title="F2"
        >
          Rename
        </ToolbarButton>
        <ToolbarButton
          onClick={() => tab.selectedId && tab.openDetail(tab.selectedId)}
          disabled={!tab.selectedId}
          title="Enter"
        >
          Open
        </ToolbarButton>
      </TabToolbar>

      {tab.error && <ErrorBanner message={tab.error} />}

      <DataGrid
        rows={rows}
        columns={gridState.columns}
        columnCtx={columnCtx}
        selectedId={tab.selectedId}
        onSelect={tab.setSelectedId}
        onOpenDetail={tab.openDetail}
        ariaLabel="Goals"
        rowMenu={tab.rowMenu}
        enableFilters
        enableSort
        sort={gridState.sort}
        onSortChange={gridState.toggleSort}
        filters={gridState.filters}
        onFilterChange={gridState.setFilter}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        empty={
          <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
            No goals match this view.
          </div>
        }
      />

      <NodeDetailDrawer node={tab.detailNode} onClose={() => tab.setDetailId(null)} />

      <ShowFieldsDialog
        open={showFields}
        allColumns={allColumns}
        shownIds={gridState.order}
        onShow={gridState.show}
        onHide={gridState.hide}
        onMove={gridState.move}
        onReset={gridState.resetColumns}
        onClose={() => setShowFields(false)}
      />
    </div>
  );
}
