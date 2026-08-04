"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { asGroupBy, sliceTree, type GroupBy, type GridRow } from "@/lib/tree/slice";
import { formatEffort } from "@/lib/tree/format";
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
import {
  GridToolbar,
  switchValue,
  type GridSwitch,
} from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import {
  abbrStateColumn,
  actualEffortColumn,
  actualStartColumn,
  assigneeColumn,
  categoryColumn,
  typeColumn,
  completedColumn,
  contextsColumn,
  costColumn,
  dateCompletedColumn,
  dateCreatedColumn,
  deadlineColumn,
  descriptionColumn,
  effortDrivenColumn,
  focusColumn,
  lapColumn,
  leadTimeColumn,
  nameColumn,
  percentColumn,
  placeColumn,
  priorityColumn,
  purposeColumn,
  resultAreaNameColumn,
  stateColumn,
  targetEndColumn,
  targetStartColumn,
} from "@/components/grid/commonColumns";
import { EffortCell, ReadOnlyCell, StatusCell } from "@/components/grid/cells";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { ToolbarButton, ToolbarSelect, ToolbarToggle } from "./tabChrome";
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
    categoryColumn(),
    typeColumn(),
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
    // Compact-hidden like the prior hand-rolled column: two bare dates compete on a phone.
    { ...targetStartColumn(), compact: "hidden" as const },
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
    lapColumn(),
    purposeColumn(),
    assigneeColumn(),
    // Optional AP fields — available via Show Fields; not in view defaults.
    actualEffortColumn(),
    actualStartColumn(),
    completedColumn(),
    contextsColumn(),
    dateCompletedColumn(),
    dateCreatedColumn(),
    descriptionColumn(),
    effortDrivenColumn(),
    costColumn("expectedCost", "Expected cost", (node) => node.expectedCost),
    focusColumn(),
    costColumn("costHigh", "High cost", (node) => node.costHigh),
    leadTimeColumn(),
    costColumn("costLow", "Low cost", (node) => node.costLow),
    placeColumn(),
    resultAreaNameColumn(),
    stateColumn(),
    targetEndColumn(),
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

/**
 * Toolbar toggles this tab declares. They live in the persisted `switches` map rather than
 * component state, so they survive a reload like every other grid preference.
 *
 * `includeDeferred` keeps its own hook: it is stored on the **tab** scope so one setting
 * covers every sub-view, where these are per-view.
 */
const PROJECT_SWITCHES: GridSwitch[] = [
  { id: "includeGoals", label: "Goals", defaultOn: false },
];

/**
 * Achieve opens Projects grouped Category → Result Area. That used to be a `Groups` toggle
 * beside the picker, which meant Group by → (None) still showed headers — two controls for
 * one thing, with the older one quietly winning. It is the tab's **default grouping** now,
 * so the picker shows it, can extend it, and can genuinely clear it.
 */
const PROJECT_DEFAULT_GROUP_BY = ["category", "resultArea"];

/** Dimensions worth offering here. Goal is included; a project's goal is its natural home. */
const PROJECT_GROUP_DIMENSIONS: GroupBy[] = [
  "category",
  "resultArea",
  "goal",
  "state",
  "priorityLetter",
  "deadlineBand",
];

export function ProjectsGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const tab = useGridTab(initialNodes);
  const [view, setView] = useTabView("projects", VIEW_IDS, "active-status");
  const [scopeId, setScopeId] = useState<string>("");
  const [includeDeferred, setIncludeDeferred] = useIncludeDeferred("projects");
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<string[]>([]);

  const resultAreas = useMemo(
    () => tab.nodes.filter((n) => n.type === "result_area"),
    [tab.nodes],
  );

  const allColumns = useMemo(
    () => buildColumns(tab.nodes, tab.today),
    [tab.nodes, tab.today],
  );
  const defaultOrder = useMemo(() => viewOrder(view), [view]);
  const gridState = useGridState(
    `projects.${view}`,
    allColumns,
    defaultOrder,
    PROJECT_DEFAULT_GROUP_BY,
  );
  const rowDrag = useTreeRowDrag({
    nodes: tab.nodes,
    byId: tab.byId,
    apply: tab.apply,
    patch: tab.patch,
    selectOne: tab.selectOne,
    headerSorts: gridState.sorts,
    clearHeaderSort: gridState.clearSort,
  });

  const includeGoals = switchValue(gridState, PROJECT_SWITCHES[0]);

  // When the view changes, reset to that view's preset (still overridable via Show Fields).
  const columns = gridState.columns;

  const rows: GridRow[] = useMemo(() => {
    const groupBy = asGroupBy(gridState.groupBy);

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
  }, [
    tab.nodes,
    tab.today,
    view,
    gridState.groupBy,
    includeGoals,
    includeDeferred,
    scopeId,
  ]);

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
  // Shift-range and arrows walk the on-screen list, not the whole tree.
  const navigableKey = navigableIds.join("\0");
  const [seenNavigable, setSeenNavigable] = useState(navigableKey);
  if (navigableKey !== seenNavigable) {
    setSeenNavigable(navigableKey);
    tab.setNavigableIds(navigableIds);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Projects"
        allColumns={allColumns}
        distinctValues={distinctValues}
        groupDimensions={PROJECT_GROUP_DIMENSIONS}
        groupIds={groupIds}
        switches={PROJECT_SWITCHES}
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
            {/* Tab-scoped, not per-view: one Postponed setting covers every sub-view. */}
            <ToolbarToggle
              checked={includeDeferred}
              onChange={() => setIncludeDeferred(!includeDeferred)}
              label="Postponed"
            />
          </>
        }
        right={
          <>
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
          </>
        }
      />

      <DataGrid
        rows={rows}
        columns={columns}
        allColumns={allColumns}
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
            No projects match this view.
          </div>
        }
      />

      <NodeDetailDrawer
        node={tab.detailNode}
        nodes={tab.nodes}
        onClose={() => tab.setDetailId(null)}
      />
    </div>
  );
}
