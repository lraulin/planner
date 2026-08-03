"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { sliceTree, type GroupBy, type GridRow } from "@/lib/tree/slice";
import { formatEffort, formatPriority } from "@/lib/tree/format";
import {
  scheduleStatusById,
  scheduleStatusForNode,
  STATUS_LABELS,
} from "@/lib/tree/status";
import type { ColumnDef } from "@/components/grid/columns";
import { DataGrid } from "@/components/grid/DataGrid";
import {
  useGridState,
  useIncludeDeferred,
  useTabView,
} from "@/components/grid/useGridState";
import { useTreeRowDrag } from "@/components/grid/useTreeRowDrag";
import { ShowFieldsDialog } from "@/components/grid/ShowFieldsDialog";
import {
  abbrStateColumn,
  deadlineColumn,
  nameColumn,
  percentColumn,
  priorityColumn,
} from "@/components/grid/commonColumns";
import { EffortCell, StatusCell } from "@/components/grid/cells";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import {
  ErrorBanner,
  TabToolbar,
  ToolbarButton,
  ToolbarSelect,
  ToolbarToggle,
} from "./tabChrome";
import { useGridTab } from "./useGridTab";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";

const VIEW_IDS = ["active-status", "active-schedule", "completed", "all"] as const;

type ViewId = (typeof VIEW_IDS)[number];

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "active-status", label: "Active Task Status" },
  { id: "active-schedule", label: "Active Task Schedule" },
  { id: "completed", label: "Completed Tasks" },
  { id: "all", label: "All Tasks" },
];

const DEFAULT_ORDER = [
  "abbrState",
  "priority",
  "name",
  "effort",
  "effortLeft",
  "deadline",
  "percent",
  "status",
];

function isActive(node: OutlineNode): boolean {
  return node.state !== "completed" && node.state !== "cancelled";
}

function buildColumns(
  allNodes: OutlineNode[],
  today: string | null,
): ColumnDef<OutlineColumnCtx>[] {
  const statuses = scheduleStatusById(allNodes, today);
  return [
    abbrStateColumn(),
    priorityColumn(),
    nameColumn({ dragHandle: true }),
    {
      id: "effort",
      label: "Effort",
      width: "4.5rem",
      align: "right",
      sortValue: (row) => row.node.effortRollupMinutes ?? -1,
      // This column has no filter to borrow text from, and "how long is it" is one of the
      // three things worth a chip on a phone.
      compactText: (row) => formatEffort(row.node.effortRollupMinutes) || null,
      render: (row, ctx) => (
        <EffortCell
          key={`effort:${formatEffort(row.node.effortMinutes)}`}
          node={row.node}
          onChange={(minutes) => ctx.onEffortChange(row.node, minutes)}
        />
      ),
    },
    {
      id: "effortLeft",
      label: "Left",
      width: "4.5rem",
      align: "right",
      sortValue: (row) => row.node.effortLeftRollupMinutes ?? -1,
      // Reads as a second effort chip with no label to tell them apart.
      compact: "hidden",
      render: (row) => (
        <EffortCell
          key={`left:${formatEffort(row.node.effortLeftMinutes)}`}
          node={row.node}
          field="effortLeft"
          onChange={() => {
            /* effort left is rolled; edits go through the drawer for now */
          }}
        />
      ),
    },
    deadlineColumn(),
    percentColumn(),
    {
      // The Task Chooser's flat cross-project ranking. Off by default — it belongs to the
      // chooser — but it is a real field on the task, so it is available here too, where
      // triage already happens. Read-only: assigning a rank means placing it among all the
      // others, which is the chooser's job.
      id: "tcPriority",
      label: "TC Pri",
      width: "3.5rem",
      align: "center",
      filterKind: "priority",
      filterValue: (row) =>
        formatPriority(row.node.tcPriorityLetter, row.node.tcPriorityRank) || null,
      sortValue: (row) =>
        formatPriority(row.node.tcPriorityLetter, row.node.tcPriorityRank),
      render: (row) => (
        <span className="tabular text-[0.8125rem] font-medium text-ink-muted">
          {formatPriority(row.node.tcPriorityLetter, row.node.tcPriorityRank)}
        </span>
      ),
    },
    {
      id: "status",
      label: "Status",
      width: "7.5rem",
      filterKind: "enum",
      filterValue: (row) =>
        STATUS_LABELS[
          statuses.get(row.node.id) ?? scheduleStatusForNode(row.node, today)
        ],
      // Derived from dates + state (manual §3.8 bands), with child→parent roll-up.
      compact: "hidden",
      render: (row, ctx) => (
        <StatusCell
          node={row.node}
          today={ctx.today}
          status={statuses.get(row.node.id)}
        />
      ),
    },
  ];
}

export function TasksGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const tab = useGridTab(initialNodes);
  const [view, setView] = useTabView("tasks", VIEW_IDS, "active-status");
  const [scopeId, setScopeId] = useState<string>("");
  const [groupByArea, setGroupByArea] = useState(false);
  const [includeDeferred, setIncludeDeferred] = useIncludeDeferred("tasks");
  const [showPurpose, setShowPurpose] = useState(false);
  const [showFields, setShowFields] = useState(false);

  const projects = useMemo(
    () => tab.nodes.filter((n) => n.type === "project"),
    [tab.nodes],
  );

  const allColumns = useMemo(
    () => buildColumns(tab.nodes, tab.today),
    [tab.nodes, tab.today],
  );
  const gridState = useGridState(`tasks.${view}`, allColumns, DEFAULT_ORDER);
  const rowDrag = useTreeRowDrag({
    nodes: tab.nodes,
    byId: tab.byId,
    apply: tab.apply,
    patch: tab.patch,
    selectOne: tab.selectOne,
    headerSort: gridState.sort,
    clearHeaderSort: gridState.clearSort,
  });

  const purposeText = useMemo(() => {
    if (!showPurpose || !scopeId) return null;
    const project = tab.byId.get(scopeId);
    return project?.purpose ?? "";
  }, [showPurpose, scopeId, tab.byId]);

  const rows: GridRow[] = useMemo(() => {
    const groupBy: GroupBy[] = groupByArea ? ["resultArea"] : [];
    return sliceTree(tab.nodes, {
      keep: (node) => {
        if (node.type !== "task") return false;
        if (view === "completed") return node.state === "completed";
        if (view === "all") return true;
        return isActive(node);
      },
      groupBy,
      // Empty scope = all; special "__none__" = tasks with no project ancestor.
      scopeId: scopeId && scopeId !== "__none__" ? scopeId : null,
      includeDeferred,
      today: tab.today,
    }).filter((row) => {
      if (scopeId !== "__none__" || row.kind !== "node") return true;
      // No project in the ancestor chain.
      let cur: OutlineNode | undefined = row.node;
      while (cur) {
        if (cur.type === "project") return false;
        cur = cur.parentId ? tab.byId.get(cur.parentId) : undefined;
      }
      return true;
    });
  }, [tab.nodes, tab.byId, tab.today, view, groupByArea, includeDeferred, scopeId]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <TabToolbar>
        <ToolbarSelect
          label="Project"
          value={scopeId}
          onChange={setScopeId}
          options={[
            { value: "", label: "<All Projects>" },
            { value: "__none__", label: "<No Project>" },
            ...projects.map((project) => ({
              value: project.id,
              label: project.name || "Untitled project",
            })),
          ]}
        />
        <ToolbarSelect
          label="View"
          value={view}
          onChange={(value) => setView(value as ViewId)}
          options={VIEWS.map((entry) => ({ value: entry.id, label: entry.label }))}
        />
        <ToolbarToggle
          checked={groupByArea}
          onChange={() => setGroupByArea((v) => !v)}
          label="Group by Area"
        />
        <ToolbarToggle
          checked={includeDeferred}
          onChange={() => setIncludeDeferred(!includeDeferred)}
          label="Postponed"
        />
        <ToolbarToggle
          checked={showPurpose}
          onChange={() => setShowPurpose((v) => !v)}
          label="Project's Purpose"
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
          onClick={gridState.reset}
          title="Clear filters, sort, column layout and collapsed groups for this view"
        >
          Reset this grid
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

      {showPurpose && (
        <div className="flex-none border-b border-rule bg-surface-raised/60 px-4 py-2">
          <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
            Project&apos;s Purpose
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-[0.8125rem] text-ink-muted">
            {scopeId
              ? purposeText || "No purpose recorded for this project."
              : "Select a project to show its purpose."}
          </p>
        </div>
      )}

      {tab.error && <ErrorBanner message={tab.error} />}

      <DataGrid
        rows={rows}
        columns={gridState.columns}
        columnCtx={tab.cellHandlers}
        selectedId={tab.selectedId}
        selectedIds={tab.selectedIds}
        onSelect={tab.select}
        onOpenDetail={tab.openDetail}
        ariaLabel="Tasks"
        rowNumbers
        rowMenu={tab.rowMenu}
        rowDrag={rowDrag}
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
            No tasks match this view.
          </div>
        }
      />

      <NodeDetailDrawer
        node={tab.detailNode}
        nodes={tab.nodes}
        onClose={() => tab.setDetailId(null)}
      />

      <ShowFieldsDialog
        open={showFields}
        allColumns={allColumns}
        shownIds={gridState.order}
        onShow={gridState.show}
        onHide={gridState.hide}
        onMove={gridState.move}
        onReset={gridState.resetColumns}
        onResetGrid={gridState.reset}
        onClose={() => setShowFields(false)}
      />
    </div>
  );
}
