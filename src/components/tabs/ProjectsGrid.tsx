"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { sliceTree, type GroupBy, type GridRow } from "@/lib/tree/slice";
import { formatEffort, formatPriority } from "@/lib/tree/format";
import { toDateKey } from "@/lib/schedule/geometry";
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
import { SortChip, sortColumnLabel } from "@/components/grid/SortChip";
import { ShowFieldsDialog } from "@/components/grid/ShowFieldsDialog";
import {
  abbrStateColumn,
  deadlineColumn,
  nameColumn,
  percentColumn,
  priorityColumn,
} from "@/components/grid/commonColumns";
import { EffortCell, ReadOnlyCell, StatusCell } from "@/components/grid/cells";
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

const VIEW_IDS = [
  "active-status",
  "active-schedule",
  "active-purpose",
  "active-delegation",
  "completed",
  "all",
] as const;

type ViewId = (typeof VIEW_IDS)[number];

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "active-status", label: "Active Project Status" },
  { id: "active-schedule", label: "Active Project Schedule" },
  { id: "active-purpose", label: "Active Project Purpose" },
  { id: "active-delegation", label: "Active Project Delegation" },
  { id: "completed", label: "Completed Projects" },
  { id: "all", label: "All Projects" },
];

const STATUS_COLUMNS = [
  "abbrState",
  "priority",
  "name",
  "tasks",
  "effort",
  "effortLeft",
  "targetStart",
  "deadline",
  "percent",
  "status",
  "lap",
] as const;

function isActive(node: OutlineNode): boolean {
  return node.state !== "completed" && node.state !== "cancelled";
}

function taskRatio(projectId: string, nodes: OutlineNode[]): string {
  let total = 0;
  let active = 0;
  const byParent = new Map<string | null, OutlineNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  const stack = [...(byParent.get(projectId) ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === "task") {
      total += 1;
      if (isActive(node)) active += 1;
    }
    for (const child of byParent.get(node.id) ?? []) stack.push(child);
  }
  if (total === 0) return "";
  return `${active}/${total}`;
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
      id: "tasks",
      label: "Tasks",
      width: "4rem",
      align: "right",
      sortValue: (row) => taskRatio(row.node.id, allNodes),
      render: (row) => (
        <ReadOnlyCell value={taskRatio(row.node.id, allNodes)} align="right" />
      ),
    },
    {
      id: "effort",
      label: "Effort",
      width: "4.5rem",
      align: "right",
      filterKind: "text",
      filterValue: (row) => formatEffort(row.node.effortRollupMinutes) || null,
      sortValue: (row) => row.node.effortRollupMinutes ?? -1,
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
        <ReadOnlyCell
          value={formatEffort(row.node.effortLeftRollupMinutes)}
          align="right"
        />
      ),
    },
    {
      id: "targetStart",
      label: "Start",
      width: "7rem",
      align: "right",
      // Two bare dates on one line with nothing to say which is which; the deadline is the
      // one that matters at a glance.
      compact: "hidden",
      filterKind: "date",
      filterValue: (row) =>
        row.node.targetStart ? toDateKey(row.node.targetStart) : null,
      sortValue: (row) =>
        row.node.targetStart ? toDateKey(row.node.targetStart) : null,
      render: (row) => (
        <ReadOnlyCell
          value={row.node.targetStart ? toDateKey(row.node.targetStart) : ""}
          align="right"
        />
      ),
    },
    deadlineColumn(),
    percentColumn(),
    {
      id: "status",
      label: "Status",
      width: "7.5rem",
      filterKind: "enum",
      // Derived from the state and deadline chips already on the line.
      compact: "hidden",
      filterValue: (row) =>
        STATUS_LABELS[
          statuses.get(row.node.id) ?? scheduleStatusForNode(row.node, today)
        ],
      sortValue: (row) =>
        statuses.get(row.node.id) ?? scheduleStatusForNode(row.node, today),
      render: (row, ctx) => (
        <StatusCell
          node={row.node}
          today={ctx.today}
          status={statuses.get(row.node.id)}
        />
      ),
    },
    {
      id: "lap",
      label: "L.A.P.",
      width: "3.5rem",
      align: "center",
      filterKind: "priority",
      filterValue: (row) =>
        formatPriority(row.node.lapLetter, row.node.lapRank) || null,
      sortValue: (row) => formatPriority(row.node.lapLetter, row.node.lapRank),
      render: (row) => (
        <ReadOnlyCell
          value={formatPriority(row.node.lapLetter, row.node.lapRank)}
          align="center"
        />
      ),
    },
    {
      id: "purpose",
      label: "Purpose",
      width: "minmax(10rem,1fr)",
      filterKind: "text",
      filterValue: (row) => row.node.purpose || null,
      render: (row) => <ReadOnlyCell value={row.node.purpose} />,
    },
    {
      id: "assignedTo",
      label: "Assigned",
      width: "8rem",
      filterKind: "text",
      filterValue: (row) => row.node.assignedTo || null,
      render: (row) => <ReadOnlyCell value={row.node.assignedTo} />,
    },
  ];
}

function viewOrder(view: ViewId): string[] {
  switch (view) {
    case "active-purpose":
      return ["abbrState", "priority", "name", "purpose", "status", "deadline"];
    case "active-delegation":
      return ["abbrState", "priority", "name", "assignedTo", "status", "deadline"];
    case "active-schedule":
      return [
        "abbrState",
        "priority",
        "name",
        "targetStart",
        "deadline",
        "effort",
        "effortLeft",
        "status",
      ];
    default:
      return [...STATUS_COLUMNS];
  }
}

export function ProjectsGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const tab = useGridTab(initialNodes);
  const [view, setView] = useTabView("projects", VIEW_IDS, "active-status");
  const [scopeId, setScopeId] = useState<string>("");
  const [groups, setGroups] = useState(true);
  const [includeGoals, setIncludeGoals] = useState(false);
  const [includeDeferred, setIncludeDeferred] = useIncludeDeferred("projects");
  const [showFields, setShowFields] = useState(false);

  const resultAreas = useMemo(
    () => tab.nodes.filter((n) => n.type === "result_area"),
    [tab.nodes],
  );

  const allColumns = useMemo(
    () => buildColumns(tab.nodes, tab.today),
    [tab.nodes, tab.today],
  );
  const defaultOrder = useMemo(() => viewOrder(view), [view]);
  const gridState = useGridState(`projects.${view}`, allColumns, defaultOrder);
  const rowDrag = useTreeRowDrag({
    nodes: tab.nodes,
    byId: tab.byId,
    apply: tab.apply,
    patch: tab.patch,
    selectOne: tab.selectOne,
    headerSort: gridState.sort,
    clearHeaderSort: gridState.clearSort,
  });

  // When the view changes, reset to that view's preset (still overridable via Show Fields).
  const columns = gridState.columns;

  const rows: GridRow[] = useMemo(() => {
    const groupBy: GroupBy[] = groups ? ["category", "resultArea"] : [];
    return sliceTree(tab.nodes, {
      keep: (node) => {
        if (node.type === "project") {
          if (view === "completed") return node.state === "completed";
          if (view === "all") return true;
          return isActive(node);
        }
        if (includeGoals && node.type === "goal") {
          if (view === "completed") return node.state === "completed";
          if (view === "all") return true;
          return isActive(node);
        }
        return false;
      },
      groupBy,
      scopeId: scopeId || null,
      includeDeferred,
      today: tab.today,
    });
  }, [tab.nodes, tab.today, view, groups, includeGoals, includeDeferred, scopeId]);

  const navigableIds = useMemo(
    () => rows.flatMap((row) => (row.kind === "node" ? [row.id] : [])),
    [rows],
  );
  // Shift-range and arrows walk the on-screen list, not the whole tree.
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
        <ToolbarToggle
          checked={groups}
          onChange={() => setGroups((v) => !v)}
          label="Groups"
        />
        <ToolbarToggle
          checked={includeGoals}
          onChange={() => setIncludeGoals((v) => !v)}
          label="Goals"
        />
        <ToolbarToggle
          checked={includeDeferred}
          onChange={() => setIncludeDeferred(!includeDeferred)}
          label="Postponed"
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

      {tab.error && <ErrorBanner message={tab.error} />}

      {gridState.sort && (
        <SortChip
          sort={gridState.sort}
          columnLabel={sortColumnLabel(gridState.sort, allColumns)}
          onClear={gridState.clearSort}
        />
      )}

      <DataGrid
        rows={rows}
        columns={columns}
        columnCtx={tab.cellHandlers}
        selectedId={tab.selectedId}
        selectedIds={tab.selectedIds}
        onSelect={tab.select}
        onOpenDetail={tab.openDetail}
        ariaLabel="Projects"
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
            No projects match this view.
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
